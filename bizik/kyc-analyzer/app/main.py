"""KYC image analysis service.

One endpoint: give it the ID photo and the selfie, get back what can actually be
measured about them, plus the reasoning a human reviewer needs. Scores are
``null`` wherever a measurement was impossible — this service never fills a gap
with a plausible-looking number.

It is deliberately dumb about identity: it holds no database, no user, no
decision. It measures images. Approving or rejecting stays with the operator.
"""

from __future__ import annotations

import base64
import binascii
import os
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .analysis import analyse
from .models import models

app = FastAPI(title="BiZik KYC analyzer", version="1.0")

# Refuse anything absurd before decoding it into memory.
MAX_IMAGE_BYTES = int(os.getenv("KYC_MAX_IMAGE_BYTES", str(12 * 1024 * 1024)))


class AnalyzeRequest(BaseModel):
    """Images as base64, with or without a data: prefix."""

    id_front: str = Field(..., description="Photo of the front of the ID document")
    selfie: str = Field(..., description="Selfie of the applicant")
    id_back: Optional[str] = Field(None, description="Optional back of the ID")


class CheckOut(BaseModel):
    id: str
    label: str
    passed: bool
    detail: str


class AnalyzeResponse(BaseModel):
    analyzed: bool
    engine: str
    documentQuality: Optional[float]
    faceMatch: Optional[float]
    selfieCheck: Optional[float]
    checks: list[CheckOut]
    # Advisory triage only. The operator still decides.
    recommendation: dict


def _decode(payload: str, field: str) -> np.ndarray:
    """base64 (optionally a data: URL) -> BGR image."""
    raw = payload.split(",", 1)[1] if payload.startswith("data:") else payload
    try:
        blob = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail=f"{field} is not valid base64")
    if len(blob) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=f"{field} exceeds {MAX_IMAGE_BYTES} bytes")
    image = cv2.imdecode(np.frombuffer(blob, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail=f"{field} is not a readable image")
    return image


@app.get("/health")
def health() -> dict:
    loaded = models()
    return {"status": "ok" if loaded.ready else "degraded", **loaded.status()}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    loaded = models()
    if not loaded.ready:
        # Say so rather than returning scores nobody should trust.
        raise HTTPException(status_code=503, detail="Face detection model is not loaded")

    id_front = _decode(request.id_front, "id_front")
    selfie = _decode(request.selfie, "selfie")

    result = analyse(id_front, selfie, loaded.detector, loaded.recognizer)
    return AnalyzeResponse(
        analyzed=True,
        engine=result.engine,
        documentQuality=result.document_quality,
        faceMatch=result.face_match,
        selfieCheck=result.selfie_check,
        checks=[CheckOut(**check.__dict__) for check in result.checks],
        recommendation=result.recommendation,
    )
