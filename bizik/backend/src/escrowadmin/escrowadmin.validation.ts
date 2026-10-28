import { z } from 'zod';

/** Optional reason recorded on a manual refund. */
export const refundSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/** A signed ledger adjustment with a mandatory explanatory note. */
export const adjustSchema = z.object({
  delta: z
    .number()
    .refine((value) => value !== 0, 'Adjustment amount cannot be zero')
    .refine((value) => Math.abs(value) <= 1_000_000_000, 'Adjustment out of range'),
  note: z.string().trim().min(3, 'A note explaining the adjustment is required').max(500),
});
