import { z } from 'zod';

/** Post a message in the dispute thread. */
export const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type MessageInput = z.infer<typeof messageSchema>;

/**
 * Resolve a dispute. A party can only *concede*:
 *  - the payer can FULL_RELEASE (pay the payee),
 *  - the payee can FULL_REFUND (refund the payer).
 * A mediator/admin can also do a PARTIAL_SPLIT (freelancerPct to the payee).
 */
export const resolveSchema = z.object({
  ruling: z.enum(['FULL_RELEASE', 'FULL_REFUND', 'PARTIAL_SPLIT']),
  freelancerPct: z.number().int().min(0).max(100).optional(),
  rationale: z.string().trim().max(1000).optional(),
});
export type ResolveInput = z.infer<typeof resolveSchema>;

/** Add evidence images (+ optional note) to an open dispute. */
export const evidenceSchema = z.object({
  images: z.array(z.string()).min(1, 'Attach at least one image.').max(10),
  description: z.string().trim().max(2000).optional(),
});
export type EvidenceInput = z.infer<typeof evidenceSchema>;
