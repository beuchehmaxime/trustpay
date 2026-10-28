import { z } from 'zod';

export const cancelSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

/**
 * Fund a milestone. With no body the payer funds from their wallet balance;
 * `payoutMethodId` charges that saved method (MoMo / bank / …) directly instead.
 */
export const fundSchema = z.object({
  payoutMethodId: z.string().min(1).optional(),
});
export type FundInput = z.infer<typeof fundSchema>;

export const disputeSchema = z.object({
  reason: z.enum([
    'NON_DELIVERY',
    'INCOMPLETE_WORK',
    'QUALITY_BELOW_SPEC',
    'SCOPE_CREEP',
    'COMMUNICATION_BREAKDOWN',
    'OTHER',
  ]),
  description: z.string().trim().min(5).max(2000),
  /** Base64 / data-URL evidence images (stored to Cloudinary). */
  images: z.array(z.string()).max(10).optional(),
});
