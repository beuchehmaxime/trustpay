import { config } from '../config/env';

/**
 * Which rail carries a campaign message, and what it needs to send one.
 *
 * One rail: a pre-approved template NAME plus ordered variables. Meta refuses
 * business-initiated free text, so the prose lives on their side and we only
 * name it.
 *
 * The campaign row still carries a body alongside the template name. That is
 * left in place deliberately - it is written data on existing rows, and
 * dropping a column to tidy a type is not a trade worth making.
 */

export type OutreachProvider = 'meta';

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
  // One rail. Outreach goes through the Meta Cloud API with an approved
  // template, which is also the only rail that can reach a number outside a
  // 24-hour service window.
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
