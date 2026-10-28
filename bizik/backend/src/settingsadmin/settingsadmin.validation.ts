import { z } from 'zod';

const CURRENCY = z.enum(['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF']);
const LOCALE = z.enum(['en', 'fr']);

export const generalSchema = z.object({
  platformName: z.string().trim().min(1).max(60),
  supportEmail: z.string().trim().email(),
  defaultLocale: LOCALE,
  signupsEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  kycRequiredForContracts: z.boolean(),
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().trim().max(300),
});

export const marketsSchema = z.object({
  defaultCurrency: CURRENCY,
  currencies: z
    .array(
      z.object({
        code: CURRENCY,
        label: z.string().trim().min(1).max(40),
        flag: z.string().trim().max(8),
        enabled: z.boolean(),
      }),
    )
    .min(1),
  countries: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        currency: CURRENCY,
        locale: LOCALE,
        // With the plus, e.g. "+237". The signup gate matches on this, so a
        // malformed one would silently stop admitting a market's customers.
        dialCode: z
          .string()
          .trim()
          .regex(/^\+\d{1,4}$/, 'A dial code looks like +237'),
        enabled: z.boolean(),
      }),
    )
    .max(300),
});

export const verificationSchema = z.object({
  kycThresholds: z.object({
    confidence: z.number().min(0).max(1),
    selfie: z.number().min(0).max(1),
    match: z.number().min(0).max(1),
  }),
  standardTier: z.number().int().min(1).max(3),
  sanctionsScreeningEnabled: z.boolean(),
  amlAutoFreeze: z.boolean(),
  manualReviewOnLowConfidence: z.boolean(),
  autoApproveOnPass: z.boolean(),
});

/** Payout automation: where the "needs a human" line sits, and a kill switch. */
export const payoutSettingsSchema = z.object({
  // 0 = never review; the ceiling is a sanity bound, not a business rule.
  approvalThresholdXaf: z.number().int().min(0).max(1_000_000_000),
  automaticPayouts: z.boolean(),
});

export const providersSchema = z.object({
  kyc: z.array(
    z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1).max(60),
      enabled: z.boolean(),
      note: z.string().trim().max(80).optional(),
    }),
  ),
  payments: z.array(
    z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1).max(60),
      enabled: z.boolean(),
      note: z.string().trim().max(80).optional(),
    }),
  ),
  payouts: payoutSettingsSchema,
  emailProvider: z.string().trim().min(1).max(60),
  smsProvider: z.string().trim().min(1).max(60),
});

/**
 * Transaction-monitoring thresholds.
 *
 * Bounded rather than free-form: a threshold of zero would open a case on every
 * movement and bury the compliance queue, and an enormous one would quietly
 * switch a rule off while still looking configured. Both are failure modes an
 * operator could reach by a slip of the keyboard.
 */
const amlMonitoringSchema = z.object({
  enabled: z.boolean(),
  largeTransactionUsd: z.number().min(50).max(1_000_000),
  structuringWindowHours: z.number().int().min(1).max(720),
  structuringMinCount: z.number().int().min(2).max(50),
  structuringNearThresholdRatio: z.number().min(0.05).max(1),
  velocityWindowHours: z.number().int().min(1).max(720),
  velocityMaxCount: z.number().int().min(2).max(1000),
  velocityMaxUsd: z.number().min(100).max(10_000_000),
  passThroughWindowHours: z.number().int().min(1).max(720),
  passThroughMinUsd: z.number().min(10).max(1_000_000),
  passThroughRatio: z.number().min(0.1).max(1),
});

/**
 * Retention periods.
 *
 * Floors, not just ceilings. A session retention of zero would delete live
 * sessions and sign everyone out; a login-attempt retention of zero would erase
 * the evidence of the brute-force run currently in progress. Both are reachable
 * by a slip of the keyboard in a settings form.
 */
const retentionSchema = z.object({
  enabled: z.boolean(),
  expiredSessionDays: z.number().int().min(7).max(3650),
  loginAttemptDays: z.number().int().min(30).max(3650),
  readNotificationDays: z.number().int().min(30).max(3650),
  analyticsEventDays: z.number().int().min(7).max(3650),
});

/** Zod validators keyed by settings-group. */
export const GROUP_SCHEMAS = {
  general: generalSchema,
  markets: marketsSchema,
  verification: verificationSchema,
  providers: providersSchema,
  amlMonitoring: amlMonitoringSchema,
  retention: retentionSchema,
} as const;

export const legalUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(60_000),
  version: z.string().trim().min(1).max(20),
  published: z.boolean(),
});

export type LegalUpdateInput = z.infer<typeof legalUpdateSchema>;
