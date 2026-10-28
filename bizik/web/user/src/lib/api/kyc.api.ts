import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * Identity-verification (KYC) service calls (SRS MOD-02). Types mirror the
 * backend KYC DTO and the mobile app's `kyc/types.ts` so both clients stay in
 * lockstep with the gateway.
 */

export type KycStatusValue =
  | 'NOT_STARTED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export type KycIdType =
  | 'NATIONAL_ID'
  | 'PASSPORT'
  | 'DRIVERS_LICENSE'
  | 'VOTERS_CARD';

export interface KycDocumentRef {
  type: string;
  fileId: string;
}

export interface KycStatusResponse {
  tier: number;
  tierLabel: string;
  accountStatus: string;
  status: KycStatusValue;
  statusLabel: string;
  canResubmit: boolean;
  idType: KycIdType | null;
  idNumberMasked: string | null;
  selfieScore: number | null;
  matchScore: number | null;
  rejectionReason: string | null;
  provider: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  documents: KycDocumentRef[];
}

export interface SubmitKycInput {
  country: string;
  phone: string;
  idType: KycIdType;
  idNumber: string;
  /** base64 data-URLs for the captured documents. */
  documents: {
    idFront: string;
    idBack?: string;
    selfie: string;
  };
}

/** KYC Service calls (SRS MOD-02). */
export const kycApi = {
  async status() {
    const { data } = await api.get<KycStatusResponse>(endpoints.kyc.status);
    return data;
  },
  /** Submit ID + selfie. Returns the resulting verification status. */
  async submit(input: SubmitKycInput) {
    const { data } = await api.post<KycStatusResponse>(endpoints.kyc.submit, input, {
      // The one request in this app that carries photographs. The shared 30s
      // timeout was aborting it mid-upload on a mobile connection, which nginx
      // logged as `499` - the client hung up - and the user saw as "we cannot
      // carry out this action now", a message that blames the server for a
      // request it never finished receiving. Images are downscaled before they
      // get here, so this ceiling is for a slow network rather than a big body.
      timeout: 120_000,
    });
    return data;
  },
};
