"""The measurements have to actually discriminate.

A scoring function that returns plausible numbers for anything is exactly the
problem this service replaces, so these tests feed it images with known
properties and assert it can tell them apart — and, just as importantly, that it
returns None rather than a guess when something cannot be measured.
"""

import cv2
import numpy as np
import pytest

from app.analysis import (
    Check,
    ImageStats,
    analyse,
    flatness_of,
    score_document,
    score_face_match,
    score_selfie,
    sharpness_of,
    text_density_of,
)


def flat_graphic(width=600, height=400):
    """A logo-like image: a few flat colours, hard edges."""
    image = np.full((height, width, 3), (140, 40, 120), dtype=np.uint8)
    cv2.circle(image, (width // 2, height // 2), 120, (40, 200, 240), -1)
    cv2.rectangle(image, (60, 60), (240, 120), (255, 255, 255), -1)
    return image


def photo_like(width=600, height=400, seed=7):
    """Noisy, smoothly varying content — what a camera produces."""
    rng = np.random.default_rng(seed)
    image = rng.integers(0, 255, (height, width, 3), dtype=np.uint8)
    return cv2.GaussianBlur(image, (5, 5), 0)


def printed_document(width=800, height=500):
    """A pale card covered in small dark strokes, like an ID's printed fields."""
    image = np.full((height, width, 3), 235, dtype=np.uint8)
    for row in range(60, height - 40, 26):
        for col in range(40, width - 60, 12):
            cv2.line(image, (col, row), (col + 7, row), (30, 30, 30), 2)
    return image


class TestImageMeasures:
    def test_flatness_ranks_a_graphic_above_a_photograph(self):
        # Calibrated against the real submission: the church logo measured
        # 0.754 and the photographed laptop 0.499. Synthetic images cannot
        # reproduce sensor noise, so assert the ORDERING rather than a
        # threshold — the ordering is what the score depends on.
        assert flatness_of(flat_graphic()) > flatness_of(photo_like())

    def test_sharpness_separates_focused_from_blurred(self):
        sharp = photo_like()
        blurred = cv2.GaussianBlur(sharp, (31, 31), 0)
        assert sharpness_of(cv2.cvtColor(sharp, cv2.COLOR_BGR2GRAY)) > sharpness_of(
            cv2.cvtColor(blurred, cv2.COLOR_BGR2GRAY)
        )

    def test_text_density_separates_printed_from_blank(self):
        blank = np.full((500, 800, 3), 200, dtype=np.uint8)  # a laptop lid
        printed = printed_document()
        assert text_density_of(cv2.cvtColor(printed, cv2.COLOR_BGR2GRAY)) > 0.045
        assert text_density_of(cv2.cvtColor(blank, cv2.COLOR_BGR2GRAY)) < 0.045


class TestDocumentScore:
    def _stats(self, image, faces=None):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        return ImageStats(
            width=image.shape[1],
            height=image.shape[0],
            sharpness=sharpness_of(gray),
            brightness=float(gray.mean()),
            flatness=flatness_of(image),
            faces=faces,
        ), gray

    def test_blank_object_photo_scores_poorly(self):
        # The reported case: a photo of a laptop submitted as an ID.
        blank = np.full((500, 800, 3), 200, dtype=np.uint8)
        stats, gray = self._stats(blank)
        checks: list[Check] = []
        score = score_document(stats, gray, checks)
        assert score < 0.35
        failed = {check.id for check in checks if not check.passed}
        assert "id_portrait" in failed and "id_text" in failed

    def test_document_with_portrait_and_text_scores_well(self):
        document = printed_document()
        # A detected portrait, as YuNet would report it: [x, y, w, h, ...]
        faces = np.array([[600.0, 80.0, 120.0, 150.0] + [0.0] * 11], dtype=np.float32)
        stats, gray = self._stats(document, faces)
        checks: list[Check] = []
        assert score_document(stats, gray, checks) > 0.7

    def test_a_sharp_photo_of_the_wrong_thing_is_still_capped(self):
        # The reported case: a well-lit, in-focus, high-resolution photo of a
        # laptop lid. Everything except the portrait passes, and it must still
        # score badly — 95/100 was how a reviewer got invited to approve it.
        sharp_but_wrong = photo_like(1200, 900)
        stats, gray = self._stats(sharp_but_wrong)
        checks: list[Check] = []
        assert score_document(stats, gray, checks) <= 0.30

    def test_every_score_is_explained(self):
        stats, gray = self._stats(printed_document())
        checks: list[Check] = []
        score_document(stats, gray, checks)
        # A reviewer must be able to see WHY, not just a number.
        assert len(checks) >= 4
        assert all(check.detail for check in checks)


class TestSelfieScore:
    def test_logo_submitted_as_a_selfie_scores_poorly(self):
        graphic = flat_graphic()
        gray = cv2.cvtColor(graphic, cv2.COLOR_BGR2GRAY)
        stats = ImageStats(
            width=graphic.shape[1],
            height=graphic.shape[0],
            sharpness=sharpness_of(gray),
            brightness=float(gray.mean()),
            flatness=flatness_of(graphic),
            faces=None,
        )
        checks: list[Check] = []
        score = score_selfie(stats, checks)
        # With no face there is nothing to verify: sharpness and exposure must
        # not accumulate into a respectable-looking number.
        assert score <= 0.20
        failed = {check.id for check in checks if not check.passed}
        assert "selfie_face" in failed

    def test_two_faces_is_not_a_valid_selfie(self):
        photo = photo_like()
        gray = cv2.cvtColor(photo, cv2.COLOR_BGR2GRAY)
        faces = np.array(
            [[10.0, 10.0, 80.0, 80.0] + [0.0] * 11, [300.0, 10.0, 80.0, 80.0] + [0.0] * 11],
            dtype=np.float32,
        )
        stats = ImageStats(
            width=photo.shape[1],
            height=photo.shape[0],
            sharpness=sharpness_of(gray),
            brightness=float(gray.mean()),
            flatness=flatness_of(photo),
            faces=faces,
        )
        checks: list[Check] = []
        score_selfie(stats, checks)
        face_check = next(check for check in checks if check.id == "selfie_face")
        assert not face_check.passed
        assert "2 faces" in face_check.detail


class TestFaceMatchHonesty:
    """The rule that matters most: no number unless a real comparison happened."""

    def _stats(self, faces):
        return ImageStats(width=600, height=400, sharpness=500.0, brightness=128.0, flatness=0.2, faces=faces)

    def test_returns_none_when_the_model_is_missing(self):
        checks: list[Check] = []
        faces = np.array([[10.0, 10.0, 80.0, 80.0] + [0.0] * 11], dtype=np.float32)
        result = score_face_match(
            photo_like(), self._stats(faces), photo_like(), self._stats(faces), None, checks
        )
        assert result is None
        assert checks[-1].detail.startswith("Face-recognition model unavailable")

    @pytest.mark.parametrize("missing", ["id", "selfie"])
    def test_returns_none_when_a_face_is_missing(self, missing):
        faces = np.array([[10.0, 10.0, 80.0, 80.0] + [0.0] * 11], dtype=np.float32)
        id_stats = self._stats(None if missing == "id" else faces)
        selfie_stats = self._stats(None if missing == "selfie" else faces)
        checks: list[Check] = []
        result = score_face_match(
            photo_like(), id_stats, photo_like(), selfie_stats, object(), checks
        )
        assert result is None
        assert "No face found" in checks[-1].detail
