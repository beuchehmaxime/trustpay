import { z } from 'zod';

const CURRENCIES = ['XAF', 'USD', 'EUR', 'GBP', 'NGN', 'GHS'] as const;

export const sendMoneySchema = z.object({
  /** A handle ("@maxime.b") or a phone number - whatever the sender typed. */
  to: z.string().min(3).max(60),
  amount: z.number().positive(),
  currency: z.enum(CURRENCIES),
  note: z.string().max(140).optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

export const lookupHandleSchema = z.object({
  handle: z.string().min(1).max(60),
});

export const claimHandleSchema = z.object({
  username: z.string().min(3).max(20),
});

export type SendMoneyBody = z.infer<typeof sendMoneySchema>;
