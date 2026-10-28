"""The triage suggestion has to be right about the obvious cases.

Its whole purpose is cutting operator load: an obviously unverifiable
submission and an obviously clean one should not each cost a careful reading of
five numbers. Anything in between must say "look closely" rather than guess —
a wrong "approve" here is far more expensive than a wrong "review".
"""

from app.analysis import Check, recommend


def passing(check_id: str) -> Check:
    return Check(check_id, check_id.replace("_", " ").title(), True, "Fine.")


def failing(check_id: str, detail: str = "Something is wrong.") -> Check:
    return Check(check_id, check_id.replace("_", " ").title(), False, detail)


CLEAN = [
    passing("id_portrait"),
    passing("id_text"),
    passing("id_sharpness"),
    passing("selfie_face"),
    passing("face_match"),
]


class TestRejects:
    def test_no_portrait_on_the_id_is_not_reviewable(self):
        checks = [failing("id_portrait", "No face found — this does not look like a photo ID.")]
        result = recommend(0.30, None, 0.9, checks)
        assert result["verdict"] == "reject"
        assert "photo ID" in result["reason"]

    def test_no_face_in_the_selfie_is_not_reviewable(self):
        result = recommend(0.9, None, 0.2, [failing("selfie_face", "No face detected in the selfie.")])
        assert result["verdict"] == "reject"

    def test_faces_that_do_not_match_is_not_reviewable(self):
        result = recommend(0.9, 0.2, 0.9, [failing("face_match", "These look like different people.")])
        assert result["verdict"] == "reject"

    def test_the_reported_submission_is_rejected(self):
        # Laptop photo + church logo: exactly what a reviewer was invited to approve.
        checks = [
            failing("id_portrait", "No face found — this does not look like a photo ID."),
            failing("id_text", "Text-like detail covers 9.7% of the image."),
            failing("selfie_face", "No face detected in the selfie."),
            failing("face_match", "No face found on the ID — the two could not be compared."),
        ]
        assert recommend(0.30, None, 0.20, checks)["verdict"] == "reject"


class TestApprovals:
    def test_a_strong_clean_submission_is_suggested_for_approval(self):
        result = recommend(0.88, 0.82, 0.86, CLEAN)
        assert result["verdict"] == "approve"
        assert result["confidence"] == "high"

    def test_a_borderline_match_is_never_auto_suggested(self):
        # Just above the "same person" line is exactly where a human is needed.
        assert recommend(0.88, 0.55, 0.86, CLEAN)["verdict"] == "review"

    def test_a_poor_document_is_never_suggested_for_approval(self):
        assert recommend(0.45, 0.90, 0.86, CLEAN)["verdict"] == "review"

    def test_any_failed_check_prevents_an_approve_suggestion(self):
        checks = CLEAN[:-1] + [failing("id_sharpness", "Too blurred to read reliably.")]
        assert recommend(0.88, 0.82, 0.86, checks)["verdict"] == "review"


class TestItAlwaysExplainsItself:
    def test_every_verdict_carries_a_reason_and_summary(self):
        for scores, checks in [
            ((0.30, None, 0.2), [failing("id_portrait")]),
            ((0.88, 0.82, 0.86), CLEAN),
            ((0.60, 0.50, 0.60), CLEAN),
        ]:
            result = recommend(*scores, checks)
            assert result["reason"]
            assert result["summary"]
            assert result["verdict"] in {"approve", "reject", "review"}
