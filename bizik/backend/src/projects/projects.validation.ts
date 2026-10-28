import { z } from 'zod';

/** Optional reason recorded when an admin force-cancels a contract. */
export const forceCancelSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
