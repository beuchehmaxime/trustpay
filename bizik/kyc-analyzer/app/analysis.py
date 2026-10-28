"""Measurements taken from the actual KYC images.

Everything here is a real observation of the pixels. Where something cannot be
measured — no face found, no model loaded — the score is ``None`` and the reason
is stated, never a number. That rule is the whole point of this service: the
previous stand-in returned confident scores derived from the ID *number*, so a
photo of a laptop scored 95/100 and a reviewer was invited to trust it.

What each score honestly is:

``face_match``
    A real biometric comparison: SFace embeddings of the portrait on the ID and
    of the selfie, compared by cosine similarity. This is the strongest signal
    here and the one a reviewer should weigh most.

``document_quality``
    Whether the ID image is a plausible, readable photograph of a document —
    portrait present, sharp enough, big enough, carrying printed text. It is NOT
    forgery detection: a well-made fake scores well, so it answers "can this be
    reviewed?", not "is this genuine?".

``selfie_check``
    Basic passive checks on the selfie: exactly one face, sharp, reasonably
    framed, not a flat graphic. It is NOT certified liveness — proving a live
    human needs an active challenge or a specialist provider. Named so nobody
    mistakes it for one.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

import cv2
import numpy as np

# SFace's published cosine threshold for "same person" (opencv_zoo).
SFACE_COSINE_THRESHOLD = 0.363

# Below this Laplacian variance an image is too blurred to read.
BLUR_FLOOR = 25.0
BLUR_GOOD = 250.0

# A document photo below this many pixels on its short side is too small to read.
MIN_SHORT_SIDE = 300

# Ceilings applied when the decisive thing is absent. Without a face there is
# nothing to verify, so the other measurements must not accumulate into a score
# that looks acceptable at a glance.
NO_PORTRAIT_CEILING = 0.30
NO_FACE_CEILING = 0.20


@dataclass
class Check:
    """One human-readable finding for the reviewer."""

    id: str
    label: str
    passed: bool
    detail: str


@dataclass
class ImageStats:
    width: int
    height: int
    sharpness: float
    brightness: float
    flatness: float
    faces: np.ndarray | None = None

    @property
    def face_count(self) -> int:
        return 0 if self.faces is None else int(self.faces.shape[0])


@dataclass
class AnalysisResult:
    document_quality: Optional[float] = None
    face_match: Optional[float] = None
    selfie_check: Optional[float] = None
    checks: List[Check] = field(default_factory=list)
    # Triage suggestion for the reviewer. Advisory only — see recommend().
    recommendation: dict = field(default_factory=dict)
    engine: str = "opencv-yunet-sface/1.0"


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def sharpness_of(gray: np.ndarray) -> float:
    """Variance of the Laplacian — the standard cheap focus measure."""
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def flatness_of(image: np.ndarray) -> float:
    """
    How much of the image is made of a few flat colours.

    Posters, logos and screenshots are built from large uniform areas; a
    photograph of a real object almost never is. Returns 0..1, where high means
    "this looks like generated artwork rather than a photo".
    """
    small = cv2.resize(image, (128, 128), interpolation=cv2.INTER_AREA)
    quantised = (small // 32).astype(np.int32)
    packed = quantised[:, :, 0] * 64 + quantised[:, :, 1] * 8 + quantised[:, :, 2]
    _, counts = np.unique(packed, return_counts=True)
    counts = np.sort(counts)[::-1]
    # Share of the image taken by its 8 most common colour buckets.
    return float(counts[:8].sum() / packed.size)


def text_density_of(gray: np.ndarray) -> float:
    """
    Rough share of the image occupied by small, text-like strokes.

    Printed fields on an ID leave many short, high-contrast edges. A blank
    surface (a laptop lid) leaves almost none.
    """
    edges = cv2.Canny(gray, 80, 200)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(edges, kernel, iterations=1)
    return float(np.count_nonzero(dilated) / dilated.size)


def measure(image: np.ndarray, detector) -> ImageStats:
    """Everything we can say about one image on its own."""
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = None
    if detector is not None:
        detector.setInputSize((width, height))
        _, found = detector.detect(image)
        faces = found if found is not None and len(found) else None
    return ImageStats(
        width=width,
        height=height,
        sharpness=sharpness_of(gray),
        brightness=float(gray.mean()),
        flatness=flatness_of(image),
        faces=faces,
    )


def _sharpness_score(sharpness: float) -> float:
    if sharpness <= BLUR_FLOOR:
        return 0.0
    return _clamp01((sharpness - BLUR_FLOOR) / (BLUR_GOOD - BLUR_FLOOR))


def score_document(stats: ImageStats, gray: np.ndarray, checks: List[Check]) -> float:
    """
    Is this a readable photograph of an identity document?

    Weighted so the two things that actually distinguish an ID from a random
    picture — a portrait and printed text — dominate.
    """
    has_portrait = stats.face_count >= 1
    checks.append(
        Check(
            "id_portrait",
            "Portrait on the document",
            has_portrait,
            "A face was found on the ID." if has_portrait else "No face found — this does not look like a photo ID.",
        )
    )

    text_density = text_density_of(gray)
    has_text = text_density >= 0.12
    checks.append(
        Check(
            "id_text",
            "Printed text present",
            has_text,
            f"Text-like detail covers {text_density * 100:.1f}% of the image."
            + ("" if has_text else " An ID should carry printed fields."),
        )
    )

    sharp = _sharpness_score(stats.sharpness)
    checks.append(
        Check(
            "id_sharpness",
            "In focus",
            sharp > 0.15,
            f"Focus measure {stats.sharpness:.0f}"
            + ("." if sharp > 0.15 else " — too blurred to read reliably."),
        )
    )

    big_enough = min(stats.width, stats.height) >= MIN_SHORT_SIDE
    checks.append(
        Check(
            "id_resolution",
            "Large enough to read",
            big_enough,
            f"{stats.width}×{stats.height} pixels"
            + ("." if big_enough else f" — below the {MIN_SHORT_SIDE}px minimum."),
        )
    )

    is_artwork = stats.flatness > 0.72
    checks.append(
        Check(
            "id_is_photograph",
            "Looks photographed, not designed",
            not is_artwork,
            "Colour spread is consistent with a photograph."
            if not is_artwork
            else "Large flat colour areas — this looks like a poster or graphic, not a photographed document.",
        )
    )

    score = (
        0.45 * (1.0 if has_portrait else 0.0)
        + 0.20 * (1.0 if has_text else 0.0)
        + 0.15 * sharp
        + 0.10 * (1.0 if big_enough else 0.0)
        + 0.10 * (0.0 if is_artwork else 1.0)
    )
    # A photo ID without a detectable portrait cannot be reviewed as one, no
    # matter how sharp or well-lit it is. Cap it so a crisp photo of something
    # that simply isn't an ID can never read as a good document.
    if not has_portrait:
        score = min(score, NO_PORTRAIT_CEILING)
    return _clamp01(score)


def score_selfie(stats: ImageStats, checks: List[Check]) -> float:
    """Basic passive checks on the selfie. NOT certified liveness."""
    one_face = stats.face_count == 1
    checks.append(
        Check(
            "selfie_face",
            "Exactly one face",
            one_face,
            "One face detected."
            if one_face
            else ("No face detected in the selfie." if stats.face_count == 0 else f"{stats.face_count} faces detected — there should be one."),
        )
    )

    sharp = _sharpness_score(stats.sharpness)
    checks.append(
        Check(
            "selfie_sharpness",
            "In focus",
            sharp > 0.15,
            f"Focus measure {stats.sharpness:.0f}" + ("." if sharp > 0.15 else " — too blurred."),
        )
    )

    well_lit = 40 <= stats.brightness <= 225
    checks.append(
        Check(
            "selfie_exposure",
            "Reasonably lit",
            well_lit,
            f"Mean brightness {stats.brightness:.0f}"
            + ("." if well_lit else " — too dark or blown out to judge."),
        )
    )

    is_artwork = stats.flatness > 0.72
    checks.append(
        Check(
            "selfie_is_photograph",
            "Looks photographed, not designed",
            not is_artwork,
            "Colour spread is consistent with a photograph."
            if not is_artwork
            else "Large flat colour areas — this looks like a graphic or logo, not a photo of a person.",
        )
    )

    # Face size relative to the frame: a real selfie fills a fair part of it.
    framing = 0.0
    if one_face:
        face_area = float(stats.faces[0][2] * stats.faces[0][3])
        share = face_area / float(stats.width * stats.height)
        framing = _clamp01(share / 0.10)
        checks.append(
            Check(
                "selfie_framing",
                "Face fills the frame",
                share >= 0.02,
                f"The face covers {share * 100:.1f}% of the image"
                + ("." if share >= 0.02 else " — too small to compare reliably."),
            )
        )

    score = (
        0.45 * (1.0 if one_face else 0.0)
        + 0.20 * sharp
        + 0.10 * (1.0 if well_lit else 0.0)
        + 0.10 * (0.0 if is_artwork else 1.0)
        + 0.15 * framing
    )
    # Same reasoning: with no face there is nothing to check, so sharpness and
    # exposure must not add up to a respectable-looking score.
    if stats.face_count == 0:
        score = min(score, NO_FACE_CEILING)
    return _clamp01(score)


def score_face_match(
    id_image: np.ndarray,
    id_stats: ImageStats,
    selfie_image: np.ndarray,
    selfie_stats: ImageStats,
    recognizer,
    checks: List[Check],
) -> Optional[float]:
    """
    Real biometric comparison. Returns None — never a guess — when either face
    is missing or the recognition model is unavailable.
    """
    if recognizer is None:
        checks.append(
            Check("face_match", "Face match", False, "Face-recognition model unavailable — no comparison was made.")
        )
        return None
    if id_stats.face_count == 0 or selfie_stats.face_count == 0:
        missing = "the ID" if id_stats.face_count == 0 else "the selfie"
        checks.append(
            Check("face_match", "Face match", False, f"No face found on {missing} — the two could not be compared.")
        )
        return None

    id_aligned = recognizer.alignCrop(id_image, id_stats.faces[0])
    selfie_aligned = recognizer.alignCrop(selfie_image, selfie_stats.faces[0])
    id_feature = recognizer.feature(id_aligned)
    selfie_feature = recognizer.feature(selfie_aligned)
    cosine = float(recognizer.match(id_feature, selfie_feature, cv2.FaceRecognizerSF_FR_COSINE))

    same_person = cosine >= SFACE_COSINE_THRESHOLD
    checks.append(
        Check(
            "face_match",
            "Face match",
            same_person,
            f"Cosine similarity {cosine:.3f} against a {SFACE_COSINE_THRESHOLD} threshold — "
            + ("the same person." if same_person else "these look like different people."),
        )
    )
    # Report the raw similarity mapped onto 0..1 for display, keeping the
    # threshold meaningful: at the threshold the score reads 0.5.
    if cosine <= 0:
        return 0.0
    if cosine >= SFACE_COSINE_THRESHOLD:
        return _clamp01(0.5 + 0.5 * (cosine - SFACE_COSINE_THRESHOLD) / (1.0 - SFACE_COSINE_THRESHOLD))
    return _clamp01(0.5 * (cosine / SFACE_COSINE_THRESHOLD))


def recommend(
    document_quality: Optional[float],
    face_match: Optional[float],
    selfie_check: Optional[float],
    checks: List[Check],
) -> dict:
    """
    A triage suggestion for the reviewer — never a decision.

    Most submissions are obviously fine or obviously junk, and reading five
    numbers to reach that conclusion is the operator load. This states the
    obvious cases plainly and says "look closely" for everything else. The
    operator still clicks; nothing here approves or rejects anything.
    """
    failures = [check for check in checks if not check.passed]

    # Nothing to compare, or nothing that looks like an ID: not reviewable.
    hard_blockers = {"id_portrait", "selfie_face", "face_match"}
    blocking = [check for check in failures if check.id in hard_blockers]
    if blocking:
        return {
            "verdict": "reject",
            "confidence": "high",
            "reason": blocking[0].detail,
            "summary": "The submission cannot be verified as it stands.",
        }

    # A confident match on a readable document, with the selfie checks clean.
    if (
        face_match is not None
        and face_match >= 0.75
        and (document_quality or 0) >= 0.70
        and (selfie_check or 0) >= 0.70
        and not failures
    ):
        return {
            "verdict": "approve",
            "confidence": "high",
            "reason": "The faces match and both images pass every check.",
            "summary": "Consistent with a genuine submission.",
        }

    # Everything else is a judgement call — say what to look at.
    detail = failures[0].detail if failures else "Scores are close to the thresholds."
    return {
        "verdict": "review",
        "confidence": "low",
        "reason": detail,
        "summary": "Needs a human eye — check the images before deciding.",
    }


def analyse(
    id_front: np.ndarray,
    selfie: np.ndarray,
    detector,
    recognizer,
) -> AnalysisResult:
    """Run every measurement and return the scores plus the reasons behind them."""
    checks: List[Check] = []
    id_stats = measure(id_front, detector)
    selfie_stats = measure(selfie, detector)

    id_gray = cv2.cvtColor(id_front, cv2.COLOR_BGR2GRAY)
    document_quality = score_document(id_stats, id_gray, checks)
    selfie_check = score_selfie(selfie_stats, checks)
    face_match = score_face_match(id_front, id_stats, selfie, selfie_stats, recognizer, checks)

    return AnalysisResult(
        document_quality=document_quality,
        face_match=face_match,
        selfie_check=selfie_check,
        checks=checks,
        recommendation=recommend(document_quality, face_match, selfie_check, checks),
    )
