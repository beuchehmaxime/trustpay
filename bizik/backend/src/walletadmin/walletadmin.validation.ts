import { z } from 'zod';

/** A reason is required to reject a payout (the user is refunded + notified). */
export const rejectPayoutSchema = z.object({
  reason: z.string().trim().min(3, 'A reason for rejecting is required').max(500),
});
