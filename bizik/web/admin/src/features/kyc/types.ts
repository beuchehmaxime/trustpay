/** KYC review types - mirrors the backend `reviewDto` (SRS MOD-09). */

export type KycStatusValue =
  | 'NOT_STARTED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export interface KycReviewUser {
  fullName: string;
  email: string;
  country: string | null;
  role: string;
  currentTier: number;
}

export interface KycDocumentRef {
  type: string;
  fileId: string;
}

export interface KycReviewFlag {
  reason: string;
  resolved: boolean;
  createdAt: string;
}

export interface KycQueueFilters {
  status?: KycStatusValue;
  search?: string;
  country?: string;
  idType?: string;
}

export interface KycReviewItem {
  id: string;
  userId: string;
  status: KycStatusValue;
  statusLabel: string;
  targetTier: number;
  user: KycReviewUser | null;
  idType: string | null;
  idNumber: string | null;
  /**
   * True when no identity provider is connected and the scores below are
   * placeholders - they are derived from the ID number and say NOTHING about
   * the documents. The review UI must never present them as a verdict.
   */
  providerSimulated?: boolean;
  /** Per-check findings from the image analysis, in the reviewer's language. */
  providerChecks?: { id: string; label: string; passed: boolean; detail: string }[] | null;
  /**
   * Triage suggestion from the image analysis. Advisory ONLY - it exists to
   * save the reviewer reading five numbers on an obvious case, and it never
   * approves or rejects anything.
   */
  providerAdvice?: {
    verdict: 'approve' | 'reject' | 'review';
    confidence: 'high' | 'low';
    reason: string;
    summary: string;
  } | null;
  selfieScore: number | null;
  matchScore: number | null;
  documentScore: number | null;
  provider: string | null;
  providerRef: string | null;
  rejectionReason: string | null;
  reviewItems: KycReviewFlag[];
  documents: KycDocumentRef[];
  submittedAt: string;
  reviewedAt: string | null;
}
