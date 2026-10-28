import { z } from 'zod';

const CURRENCY = z.enum(['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF']);

/** Quote a conversion rate between two currencies (SRS FR-PAY-009). */
export const fxRateSchema = z
  .object({
    from: CURRENCY,
    to: CURRENCY,
    amount: z.coerce.number().positive().optional(),
  })
  .refine((d) => d.from !== d.to, { message: 'Choose two different currencies' });

export type FxRateInput = z.infer<typeof fxRateSchema>;
