import { z } from 'zod';

/**
 * KYC submission (SRS FR-KYC-002/003). The document fields carry base64 image
 * data (or data-URLs); they are stored as encrypted objects, never persisted in
 * the request log. ID front + selfie are mandatory; the back of the card is
 * required only for cards that have one (the client decides and omits it for
 * passports).
 */
const imageString = z
  .string()
  .min(32, 'Image data looks empty')
  .max(12_000_000, 'Image is too large');

export const submitKycSchema = z.object({
  country: z.string().min(2).max(60),
  phone: z.string().min(6).max(20),
  idType: z.enum(['NATIONAL_ID', 'PASSPORT', 'DRIVERS_LICENSE', 'VOTERS_CARD']),
  idNumber: z.string().trim().min(4).max(40),
  documents: z.object({
    idFront: imageString,
    idBack: imageString.optional(),
    selfie: imageString,
  }),
});

export type SubmitKycInput = z.infer<typeof submitKycSchema>;

/** Admin reject: a reason is required so the user knows what to fix. */
export const reviewDecisionSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

export const rejectSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
