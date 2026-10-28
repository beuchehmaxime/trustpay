import { z } from 'zod';

/** All fee percentages are stored as fractions (0.035 = 3.5%). */
export const feeUpdateSchema = z.object({
  clientServicePct: z.number().min(0).max(0.5),
  freelancerFeePct: z.number().min(0).max(0.5),
  expressWithdrawalPct: z.number().min(0).max(0.5),
  fxMarginPct: z.number().min(0).max(0.2),
  minWithdrawalUsd: z.number().min(0).max(100000),
});

export const fxRateSchema = z.object({
  usdRate: z.number().positive().max(1_000_000),
});
