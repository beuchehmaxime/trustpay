import { z } from 'zod';

const PROVIDER = z.enum(['MTN_MOBILE_MONEY', 'ORANGE_MONEY', 'BANK']);
const CURRENCY = z.enum(['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF']);

/**
 * Start a deposit/withdrawal. Provide EITHER a saved `payoutMethodId` (the
 * provider + number are resolved server-side) OR a raw `provider` + `phoneNumber`.
 */
const paymentSourceSchema = z
  .object({
    amount: z.number().positive().max(1_000_000),
    currency: CURRENCY.optional(),
    payoutMethodId: z.string().trim().min(1).optional(),
    provider: PROVIDER.optional(),
    phoneNumber: z.string().trim().min(6).max(20).optional(),
  })
  .refine((body) => Boolean(body.payoutMethodId) || Boolean(body.provider && body.phoneNumber), {
    message: 'Provide a payment method, or a provider and phone number.',
  });

export const createDepositSchema = paymentSourceSchema;
export type CreateDepositBody = z.infer<typeof createDepositSchema>;

export const createWithdrawalSchema = paymentSourceSchema;
export type CreateWithdrawalBody = z.infer<typeof createWithdrawalSchema>;
