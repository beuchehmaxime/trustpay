"""Loading the two OpenCV Zoo models this service depends on.

YuNet detects faces; SFace turns a face into an embedding that can be compared.
Both are published models with known accuracy — the point of using them is that
the numbers this service reports mean something outside our own codebase.

If a model is missing the service still starts and still reports what it can
measure, marking the rest unavailable. It must never invent a score to fill a
gap: that is exactly the failure this whole service exists to correct.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import cv2

MODEL_DIR = Path(os.getenv("KYC_MODEL_DIR", "/app/models"))
DETECTOR_FILE = MODEL_DIR / "face_detection_yunet_2023mar.onnx"
RECOGNIZER_FILE = MODEL_DIR / "face_recognition_sface_2021dec.onnx"

# A Git-LFS pointer is a few hundred bytes; the real models are far larger.
MIN_DETECTOR_BYTES = 100_000
MIN_RECOGNIZER_BYTES = 1_000_000


def _usable(path: Path, minimum: int) -> bool:
    return path.is_file() and path.stat().st_size >= minimum


def load_detector():
    """YuNet face detector, or None when the model file is not usable."""
    if not _usable(DETECTOR_FILE, MIN_DETECTOR_BYTES):
        return None
    return cv2.FaceDetectorYN_create(
        str(DETECTOR_FILE),
        "",
        (320, 320),
        0.75,  # score threshold — deliberately strict: a "maybe" is not a face
        0.3,  # NMS threshold
        5000,  # top k
    )


def load_recognizer():
    """SFace recogniser, or None when the model file is not usable."""
    if not _usable(RECOGNIZER_FILE, MIN_RECOGNIZER_BYTES):
        return None
    return cv2.FaceRecognizerSF_create(str(RECOGNIZER_FILE), "")


def describe() -> dict:
    """What the service can actually do right now — surfaced on /health."""
    return {
        "detector": _usable(DETECTOR_FILE, MIN_DETECTOR_BYTES),
        "recognizer": _usable(RECOGNIZER_FILE, MIN_RECOGNIZER_BYTES),
        "modelDir": str(MODEL_DIR),
    }


class Models:
    """Loaded once at startup and reused — these are not cheap to construct."""

    def __init__(self) -> None:
        self.detector = load_detector()
        self.recognizer = load_recognizer()

    @property
    def ready(self) -> bool:
        return self.detector is not None

    def status(self) -> dict:
        return {
            "detectorLoaded": self.detector is not None,
            "recognizerLoaded": self.recognizer is not None,
            **describe(),
        }


_models: Optional[Models] = None


def models() -> Models:
    global _models
    if _models is None:
        _models = Models()
    return _models
