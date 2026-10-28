/**
 * SMS transport seam.
 *
 * The platform is phone-first: verification codes, payout-number OTPs and
 * security alerts all ride on SMS, so which carrier delivers them is an
 * operational decision that should not be spread through the app. Each provider
 * implements this interface and `lib/sms.ts` picks one.
 */
export interface SmsSendResult {
  /** Provider-side id, for correlating a delivery receipt later. */
  id?: string;
  /** Which provider actually sent it, for the logs. */
  provider: string;
}

export interface SmsProvider {
  /** Short name used in logs and the SMS_PROVIDER setting. */
  readonly name: string;
  /** Whether this provider has everything it needs to send. */
  isConfigured(): boolean;
  /** Send one message. Throws on failure so the caller can fall back. */
  send(to: string, body: string): Promise<SmsSendResult>;
}

/** Last four digits only - numbers are personal data and logs are not. */
export function maskNumber(phone: string): string {
  return phone.length > 4 ? `${'•'.repeat(phone.length - 4)}${phone.slice(-4)}` : phone;
}
