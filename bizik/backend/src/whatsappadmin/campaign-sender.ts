import { config } from '../config/env';

/**
 * Which rail carries a campaign message, and what it needs to send one.
 *
 * Two rails with genuinely different shapes:
 *
 *  - **meta**: a pre-approved template NAME plus ordered variables. Meta refuses
 *    business-initiated free text, so the prose lives on their side and we only
 *    name it.
 *  - **wasender**: free text through a QR-linked WhatsApp account. No template
 *    to approve, which is why it works today - and no template to hide behind,
 *    which is why the body has to be written and stored here.
 *
 * Both are kept wired so switching is one environment variable, the same way
 * verification codes work. The campaign row carries a template name AND a body
 * for exactly that reason.
 */

export type OutreachProvider = 'meta' | 'wasender';

export interface CampaignMessage {
  template: string;
  language: string;
  variables: string[];
  body: string | null;
}

export interface CampaignSendResult {
  ok: boolean;
  messageId?: string | null;
  error?: string;
  /** True when the rail refused for a reason that will refuse the next one too. */
  fatal?: boolean;
  /**
   * True when the message was NOT sent but could be, later. A rate limit is the
   * case that matters: the recipient was never contacted, so writing them off
   * as FAILED loses them for the whole campaign over a wait.
   */
  transient?: boolean;
  /** Seconds the rail asked us to wait, when it says. */
  retryAfterSeconds?: number;
}

export function outreachProvider(): OutreachProvider {
  if (config.whatsapp.outreachProvider === 'wasender') {
    return config.wasender.apiKey ? 'wasender' : 'meta';
  }
  return 'meta';
}

/**
 * What this rail needs before a campaign can be created, or null if it is ready.
 *
 * Checked when the campaign is composed rather than per recipient, because
 * discovering a missing body on recipient 300 means 299 people got nothing and
 * the operator finds out from a failure count.
 */
export function missingForProvider(message: {
  template?: string | null;
  body?: string | null;
}): string | null {
  if (outreachProvider() === 'wasender') {
    return message.body && message.body.trim().length > 0
      ? null
      : 'This rail sends the message text itself, so a message body is required.';
  }
  return message.template && message.template.trim().length > 0
    ? null
    : 'A pre-approved template name is required.';
}

/**
 * Send one campaign message.
 *
 * Never throws: a campaign walks hundreds of recipients and one bad number must
 * not end the run. `fatal` separates "this recipient failed" from "the rail is
 * down or the account is blocked", which the caller uses to stop early instead
 * of grinding through the rest and failing every one.
 */
export async function sendCampaignMessage(
  phone: string,
  message: CampaignMessage,
): Promise<CampaignSendResult> {
  const provider = outreachProvider();

  try {
    if (provider === 'wasender') {
      const { WasenderClient } = await import('../whatsapp/wasender-client');
      if (!message.body) return { ok: false, error: 'no message body', fatal: true };

      const result = await WasenderClient.sendText(phone, message.body);
      if (result.ok) return { ok: true, messageId: String(result.messageId ?? '') || null };

      // A disconnected session, a dead key or an exhausted plan will refuse
      // every remaining recipient identically. Carrying on would turn one
      // problem into a campaign-sized list of identical failures.
      const fatal =
        result.failure === 'not_connected' ||
        result.failure === 'unauthorised' ||
        result.failure === 'not_configured';
      return {
        ok: false,
        error: [result.failure, result.message].filter(Boolean).join(': '),
        fatal,
        // Nothing reached this person, so they go back in the queue rather
        // than being recorded as a failed delivery.
        transient: result.failure === 'rate_limited',
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }

    const { WhatsAppClient } = await import('../whatsapp/whatsapp-client');
    const result = await WhatsAppClient.sendTemplate(
      phone,
      message.template,
      message.language,
      message.variables,
    );
    if (result.ok) return { ok: true, messageId: result.id ?? null };
    return {
      ok: false,
      error: [result.errorCode, result.errorMessage].filter(Boolean).join(' ') || 'send refused',
      // 132001 = the template does not exist. Every recipient will hit it.
      fatal: result.errorCode === 132001,
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
