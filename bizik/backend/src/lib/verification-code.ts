import { config } from '../config/env';
import { sendSmsMessage } from './sms';
import { maskNumber } from './sms-providers/types';

/**
 * Deliver a one-time code, WhatsApp first and SMS second.
 *
 * Almost everyone here already has WhatsApp, and a WhatsApp message is free,
 * instant and immune to the carrier filtering that swallows international SMS
 * into Cameroon. But not every number is on WhatsApp and no carrier is certain,
 * so SMS has to remain the fallback rather than a nicety.
 *
 * TWO WHATSAPP ROUTES, one of which is live at a time, chosen by
 * `WHATSAPP_OTP_PROVIDER`:
 *
 *  - `wasender`  WasenderAPI. Free-form text through a linked WhatsApp account.
 *                No template to approve and no recipient allow-list, which is
 *                the only reason codes can go over WhatsApp at all today.
 *  - `meta`      The official Cloud API, which needs an APPROVED authentication
 *                template and a number off the test allow-list. Kept wired up
 *                and tested so switching back is one environment variable.
 *
 * Nothing here decides whether the code is valid; the code lives in Redis and
 * this only carries it. A failure on every channel is logged loudly and
 * swallowed: the caller (signup, payout-number verification) is fire-and-forget
 * and must not fail a request because a message could not be delivered.
 */

/** Meta's error when the number simply is not a WhatsApp user. */
const NOT_A_WHATSAPP_USER = new Set([131026, 131051]);

export interface CodeDelivery {
  channel: 'whatsapp' | 'sms' | 'none';
  /** Which WhatsApp route carried it, when one did. For logs and tests. */
  provider?: 'meta' | 'wasender';
}

/**
 * Which WhatsApp route can carry a code right now, if any.
 *
 * Returning `none` is a real answer and not a failure: it means skip straight
 * to SMS rather than spending a round trip on a send that was always going to
 * be refused. Meta without an approved template is exactly that case.
 */
export function whatsappOtpRoute(): 'meta' | 'wasender' | 'none' {
  if (config.whatsapp.otpProvider === 'wasender') {
    return config.wasender.apiKey ? 'wasender' : 'none';
  }
  return config.whatsapp.enabled && config.whatsapp.otpTemplate ? 'meta' : 'none';
}

/** Kept for callers that only ask "can WhatsApp carry a code at all?". */
export function whatsappCodesEnabled(): boolean {
  return whatsappOtpRoute() !== 'none';
}

/**
 * The code message, for the route that sends free-form text.
 *
 * The Cloud API path does not use this - its wording lives in the approved
 * template on Meta's side and cannot be set from here.
 *
 * "Never share it" earns its place: a free-form code can be forwarded, and
 * every social-engineering attempt on a wallet starts by asking someone to read
 * their code out. Meta requires that line in authentication templates for the
 * same reason, so the two routes should not differ on it.
 */
function codeMessage(code: string, locale?: string): string {
  const minutes = config.emailCodeTtlMinutes;
  if (locale === 'fr') {
    return (
      `${code} est votre code de verification Bizik.\n\n` +
      `Il expire dans ${minutes} minutes. Ne le partagez avec personne - ` +
      `Bizik ne vous le demandera jamais.`
    );
  }
  return (
    `${code} is your Bizik verification code.\n\n` +
    `It expires in ${minutes} minutes. Never share it with anyone - ` +
    `Bizik will never ask you for it.`
  );
}

/** Try WasenderAPI. Returns false to mean "use SMS", never throws. */
async function trySendViaWasender(to: string, code: string, locale: string | undefined, masked: string) {
  const { WasenderClient } = await import('../whatsapp/wasender-client');
  const result = await WasenderClient.sendText(to, codeMessage(code, locale));
  if (result.ok) return true;

  // The number simply has no WhatsApp account. That is the designed path to
  // SMS, not a failure, and logging it as one would make a normal signup look
  // like an incident.
  if (result.failure === 'not_on_whatsapp') {
    console.log(`[code] ${masked} is not on WhatsApp; sending by SMS`);
    return false;
  }

  // Everything else needs a different person to do a different thing, so the
  // reasons are logged apart rather than as one "send failed".
  const advice: Record<string, string> = {
    not_connected: 'the linked WhatsApp account is disconnected - re-scan the QR in the WasenderAPI dashboard',
    rate_limited: `rate limited${result.retryAfterSeconds ? ` for ${result.retryAfterSeconds}s` : ''} - a trial plan allows one message per MINUTE`,
    unauthorised: 'the API key is rejected or the subscription is inactive',
    invalid: 'the request was rejected as malformed',
    not_configured: 'no WASENDER_API_KEY is set',
    network: 'no response from WasenderAPI',
  };
  console.warn(
    `[code] WhatsApp (wasender) failed for ${masked}: ${advice[result.failure ?? 'unknown'] ?? result.failure}` +
      `${result.message ? ` - ${result.message}` : ''}; falling back to SMS`,
  );
  return false;
}

/** Try Meta's Cloud API. Returns false to mean "use SMS", never throws. */
async function trySendViaMeta(to: string, code: string, locale: string | undefined, masked: string) {
  const { WhatsAppClient } = await import('../whatsapp/whatsapp-client');
  const language =
    locale === 'fr' ? config.whatsapp.otpTemplateLanguageFr : config.whatsapp.otpTemplateLanguage;
  // The client REPORTS failure rather than throwing, so the result has to be
  // inspected. Treating the call as successful because it did not throw would
  // silently swallow every undelivered code.
  const result = await WhatsAppClient.sendTemplate(to, config.whatsapp.otpTemplate, language, [code]);
  if (result.ok) return true;

  const notOnWhatsApp = result.errorCode !== undefined && NOT_A_WHATSAPP_USER.has(result.errorCode);
  console.warn(
    `[code] WhatsApp (meta) ${notOnWhatsApp ? 'not available for' : 'failed for'} ${masked}` +
      `${result.errorMessage ? ` - ${result.errorMessage}` : ''}; falling back to SMS`,
  );
  return false;
}

export async function sendVerificationCode(
  to: string,
  code: string,
  options: { locale?: string; purpose?: string } = {},
): Promise<CodeDelivery> {
  const masked = maskNumber(to);
  const purpose = options.purpose ?? 'verification';
  const route = whatsappOtpRoute();

  if (route !== 'none') {
    try {
      // Imported lazily so neither provider's module is pulled in when it is
      // not the one in use.
      const sent =
        route === 'wasender'
          ? await trySendViaWasender(to, code, options.locale, masked)
          : await trySendViaMeta(to, code, options.locale, masked);
      if (sent) {
        console.log(`[code] ${purpose} sent to ${masked} over WhatsApp (${route})`);
        return { channel: 'whatsapp', provider: route };
      }
    } catch (error) {
      // A throw here means the module failed to load or a call blew up in a way
      // the client did not catch. Same outcome: use SMS.
      console.warn(
        `[code] WhatsApp (${route}) attempt threw for ${masked} - ${(error as Error).message}; falling back to SMS`,
      );
    }
  }

  await sendSmsMessage(
    to,
    `${code} is your BiZik verification code. It expires in ${config.emailCodeTtlMinutes} minutes.`,
  );
  return { channel: 'sms' };
}
