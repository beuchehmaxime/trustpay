import { z } from 'zod';

const CATEGORY = z.enum(['PAYMENT', 'CONTRACT', 'KYC', 'DISPUTE', 'SECURITY', 'SYSTEM']);
const CHANNEL = z.enum(['IN_APP', 'EMAIL', 'PUSH', 'SMS']);

/** Bulk-upsert notification preferences (SRS MOD-08). */
export const updatePreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        category: CATEGORY,
        channel: CHANNEL,
        enabled: z.boolean(),
      }),
    )
    .min(1)
    .max(64),
});

export const registerPushTokenSchema = z.object({
  token: z.string().min(8).max(400),
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;
