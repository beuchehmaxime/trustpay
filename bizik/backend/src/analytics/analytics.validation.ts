import { z } from 'zod';

export const generateReportSchema = z.object({
  type: z.enum([
    'DAILY_TRANSACTION_SUMMARY',
    'MONTHLY_AML',
    'KYC_COVERAGE',
    'SUSPICIOUS_ACTIVITY',
    'EARNINGS_TAX',
    'GMV_ANALYTICS',
  ]),
});
