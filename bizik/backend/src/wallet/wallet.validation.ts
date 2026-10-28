import { z } from 'zod';

/** Add a payout destination (SRS MOD-06). */
export const addPayoutMethodSchema = z.object({
  type: z.enum(['MTN_MOMO', 'ORANGE_MONEY', 'PAYONEER', 'BANK']),
  /** Optional - mobile money uses the account owner's verified name automatically. */
  accountName: z.string().trim().min(2).max(120).optional(),
  /** Phone (mobile money), account number (bank) or email (Payoneer). */
  accountDetail: z.string().trim().min(3).max(80),
  provider: z.string().trim().max(60).optional(),
  currency: z.enum(['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF']).optional(),
  country: z.string().trim().max(60).optional(),
  makeDefault: z.boolean().optional(),
});

export type AddPayoutMethodInput = z.infer<typeof addPayoutMethodSchema>;

/** Confirm the SMS OTP for a mobile-money payout method. */
export const verifyPayoutMethodOtpSchema = z.object({
  challengeId: z.string().trim().min(1),
  code: z.string().trim().min(4).max(8),
});
export type VerifyPayoutMethodOtpInput = z.infer<typeof verifyPayoutMethodOtpSchema>;

/** Resend the SMS OTP for a pending mobile-money payout method. */
export const resendPayoutMethodOtpSchema = z.object({
  challengeId: z.string().trim().min(1),
});
export type ResendPayoutMethodOtpInput = z.infer<typeof resendPayoutMethodOtpSchema>;

const CURRENCY = z.enum(['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF']);

/** Top up a wallet from an external method (simulated gateway). */
export const addFundsSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  currency: CURRENCY,
  /** Which saved payment method to charge (MoMo / bank / …). */
  payoutMethodId: z.string().min(1).optional(),
});
export type AddFundsInput = z.infer<typeof addFundsSchema>;

/** Withdraw from a wallet to a verified payout method. */
export const payoutSchema = z.object({
  amount: z.number().positive(),
  currency: CURRENCY,
  payoutMethodId: z.string().min(1),
  express: z.boolean().optional(),
});
export type PayoutInput = z.infer<typeof payoutSchema>;

/** Convert between two wallet currencies (FR-PAY-009). */
export const convertSchema = z.object({
  fromCurrency: CURRENCY,
  toCurrency: CURRENCY,
  amount: z.number().positive(),
});
export type ConvertInput = z.infer<typeof convertSchema>;
