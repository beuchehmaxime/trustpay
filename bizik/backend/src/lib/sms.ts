import { config } from '../config/env';
import { OrangeSmsProvider } from './sms-providers/orange-sms-provider';
import { TwilioSmsProvider } from './sms-providers/twilio-sms-provider';
import { SmsProvider, maskNumber } from './sms-providers/types';

/**
 * SMS delivery, across providers.
 *
 * Orange is the Cameroon rail: a local short code reaching every local
 * operator, paid in FCFA bundles, without the international-route filtering
 * that makes a US long code unreliable here. Twilio stays for numbers outside
 * Cameroon and as the fallback when an Orange bundle runs dry.
 *
 * `SMS_PROVIDER` forces one of them; the default picks Orange for +237 numbers
 * and Twilio for the rest, falling back to whichever is left if the first
 * fails. Verification codes live in Redis, so a delivery failure never blocks
 * the flow - it just means the user never sees the code, which is why failures
 * are logged loudly and why there is a fallback at all.
 */
export const orangeSms = new OrangeSmsProvider();
export const twilioSms = new TwilioSmsProvider();

/** Cameroon numbers: the country Orange's bundle covers. */
function isCameroonNumber(phone: string): boolean {
  return phone.replace(/\D/g, '').startsWith('237');
}

/**
 * Providers to try, in order, for this number. The first configured one sends;
 * the rest are fallbacks.
 */
function providersFor(phone: string): SmsProvider[] {
  const preference = (config.smsProvider || 'auto').toLowerCase();
  const ordered =
    preference === 'orange'
      ? [orangeSms, twilioSms]
      : preference === 'twilio'
        ? [twilioSms, orangeSms]
        : isCameroonNumber(phone)
          ? [orangeSms, twilioSms]
          : [twilioSms, orangeSms];
  return ordered.filter((provider) => provider.isConfigured());
}

/**
 * Send an SMS. Never throws: verification, invites and alerts are all
 * fire-and-forget, and a delivery problem must not take a request down with it.
 */
export async function sendSmsMessage(to: string, body: string): Promise<void> {
  const masked = maskNumber(to);
  const providers = providersFor(to);

  if (providers.length === 0) {
    // Never log the message BODY in production - it carries one-time codes.
    if (process.env.NODE_ENV === 'production') {
      console.log(`[sms] (disabled) suppressed message to ${masked} - no SMS provider configured`);
    } else {
      console.log(`[sms] (disabled) would send to ${to}: ${body}`);
    }
    return;
  }

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const result = await provider.send(to, body);
      console.log(`[sms] sent to ${masked} via ${result.provider}${result.id ? ` id=${result.id}` : ''}`);
      return;
    } catch (error) {
      const reason = (error as Error).message ?? String(error);
      failures.push(`${provider.name}: ${reason}`);
      console.error(`[sms] ${provider.name} FAILED for ${masked} - ${reason}`);
    }
  }
  console.error(`[sms] GIVING UP on ${masked} after ${failures.length} attempt(s): ${failures.join(' | ')}`);
}

/** Which providers are usable, for the startup banner and the admin console. */
export function smsProviderStatus(): { name: string; configured: boolean; preferred: boolean }[] {
  const preference = (config.smsProvider || 'auto').toLowerCase();
  return [orangeSms, twilioSms].map((provider) => ({
    name: provider.name,
    configured: provider.isConfigured(),
    preferred: preference === provider.name || (preference === 'auto' && provider.name === 'orange'),
  }));
}
