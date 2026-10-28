import { config } from '../config/env';

/**
 * Client for WasenderAPI (https://www.wasenderapi.com).
 *
 * WHY THIS EXISTS, alongside the Meta Cloud API client next to it: Meta will not
 * deliver a business-initiated message without an APPROVED authentication
 * template, and our number is still on a test app with a five-recipient
 * allow-list. So every verification code falls through to SMS, and SMS into
 * Cameroon is exactly the thing we cannot rely on. WasenderAPI links an ordinary
 * WhatsApp account by QR and sends plain text, with no template to approve and
 * no allow-list, which is what makes it usable today.
 *
 * WHAT IT COSTS, stated plainly because it is a real trade and not a detail:
 * this is not WhatsApp's official API. It drives a linked WhatsApp account, and
 * Meta's terms do not permit unofficial clients, so the number carrying it can
 * be banned. That is survivable for codes - SMS is still behind it, and the
 * Meta path is still here to switch back to - and it would not be survivable
 * for the account a business depends on. Use a dedicated number, not the one a
 * person answers on.
 *
 * Nothing here throws into a request path. Every call reports its outcome, the
 * way the Meta client does, because the caller's job is to fall back rather than
 * to fail a signup over an undelivered message.
 */

/** Session states reported by GET /api/status. */
export type WasenderSessionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'need_scan'
  | 'need_passkey'
  | 'logged_out'
  | 'expired'
  | 'unknown';

/**
 * Why a send did not happen. Each one needs a different human response, so they
 * are not collapsed into a single boolean:
 *  - `not_on_whatsapp` the number has no WhatsApp account; this is the normal
 *                      case for a fallback to SMS and is not an error
 *  - `not_connected`  the linked WhatsApp account dropped; someone must re-scan
 *  - `rate_limited`   too many sends for the plan (trial is 1 per MINUTE)
 *  - `unauthorised`   bad key, or no active subscription
 *  - `invalid`        the request was malformed
 *  - `network`        we never got an answer
 */
export type WasenderFailure =
  | 'not_configured'
  | 'not_on_whatsapp'
  | 'not_connected'
  | 'rate_limited'
  | 'unauthorised'
  | 'invalid'
  | 'network'
  | 'unknown';

export interface WasenderSendResult {
  ok: boolean;
  /** WasenderAPI's own message id, for matching against their message logs. */
  messageId?: string | number;
  failure?: WasenderFailure;
  message?: string;
  /** Seconds to wait, when the API supplies one on a rate-limit refusal. */
  retryAfterSeconds?: number;
}

interface WasenderEnvelope {
  success?: boolean;
  message?: string;
  error?: string;
  retry_after?: number;
  status?: string;
  data?: {
    msgId?: string | number;
    jid?: string;
    status?: string;
    exists?: boolean;
  };
}

export function wasenderConfigured(): boolean {
  return !!config.wasender.apiKey;
}

function endpoint(path: string): string {
  return `${config.wasender.baseUrl.replace(/\/+$/, '')}${path}`;
}

/**
 * Map an HTTP status and body onto a reason.
 *
 * WasenderAPI answers in prose rather than with error codes - "Your Whatsapp
 * Session is not connected please connect your session first." - so the message
 * has to be read. Matched loosely and on the HTTP status first, so a reworded
 * message degrades to `unknown` and still falls back to SMS rather than being
 * mistaken for success.
 */
function classify(httpStatus: number, body: WasenderEnvelope): WasenderFailure {
  const text = `${body.message ?? ''} ${body.error ?? ''}`.toLowerCase();
  // Checked before the generic 422 handling below, which would otherwise call
  // this "malformed". It is not a malformed request and it is not a fault: the
  // person simply does not use WhatsApp, and the only correct response is to
  // send them an SMS. Verified against the live API, which answers
  // 422 "The provided JID does not exist on WhatsApp."
  if (text.includes('does not exist on whatsapp') || text.includes('not on whatsapp')) {
    return 'not_on_whatsapp';
  }
  if (httpStatus === 429 || text.includes('rate limit') || body.retry_after !== undefined) {
    return 'rate_limited';
  }
  if (text.includes('not connected') || text.includes('connect your session')) return 'not_connected';
  if (httpStatus === 401 || httpStatus === 403 || text.includes('invalid api key')) {
    return 'unauthorised';
  }
  // "Active subscription or trial is required" is a billing problem, not a bad
  // request, and it reads the same to an operator as a bad key: go and look at
  // the account.
  if (text.includes('subscription')) return 'unauthorised';
  if (httpStatus === 422 || httpStatus === 400 || text.includes('validation')) return 'invalid';
  return 'unknown';
}

async function request(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<{ httpStatus: number; body: WasenderEnvelope } | null> {
  try {
    const response = await fetch(endpoint(path), {
      method: init.method,
      headers: {
        Authorization: `Bearer ${config.wasender.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      // A verification code that arrives late is worth nothing, and the caller
      // has SMS behind it. Better to give up quickly than to hold a signup open.
      signal: AbortSignal.timeout(config.wasender.timeoutMs),
    });
    const body = (await response.json().catch(() => ({}))) as WasenderEnvelope;
    return { httpStatus: response.status, body };
  } catch (error) {
    console.error(`[wasender] ${path} request failed - ${(error as Error).message}`);
    return null;
  }
}

export const WasenderClient = {
  /**
   * Send a plain text message.
   *
   * `to` goes through as E.164 with the leading plus, which is the format the
   * API documents and the format we store, so no rewriting happens on the way.
   *
   * A successful response means ACCEPTED, not delivered - the API answers with
   * `status: "in_progress"` and hands the message to a linked phone that may
   * still be offline. So this reports that the send was taken, and nothing more
   * than that is claimed anywhere it is used.
   */
  async sendText(to: string, text: string): Promise<WasenderSendResult> {
    if (!wasenderConfigured()) return { ok: false, failure: 'not_configured' };

    const result = await request('/api/send-message', {
      method: 'POST',
      body: { to, text },
    });
    if (!result) return { ok: false, failure: 'network' };

    const { httpStatus, body } = result;
    // `success: false` with HTTP 200 is a shape this API uses, so the flag is
    // checked as well as the status; trusting the status alone would read a
    // refusal as a delivery.
    if (httpStatus >= 200 && httpStatus < 300 && body.success !== false) {
      return { ok: true, messageId: body.data?.msgId };
    }

    const failure = classify(httpStatus, body);
    const message = body.message ?? body.error;
    // A number that is not on WhatsApp is an ordinary outcome on the way to
    // SMS, not a fault, so it does not go to the error log - otherwise the one
    // place we look when something IS broken fills up with people who simply
    // do not use WhatsApp.
    const log = failure === 'not_on_whatsapp' ? console.log : console.error;
    log(`[wasender] send refused (${failure}) http=${httpStatus}${message ? ` - ${message}` : ''}`);
    return { ok: false, failure, message, retryAfterSeconds: body.retry_after };
  },

  /**
   * The linked account's connection state.
   *
   * Worth checking before a send only when something is already wrong; on the
   * hot path it would double the requests against a per-minute limit for an
   * answer the send itself gives. Used by the health check and the runbook.
   */
  async sessionStatus(): Promise<WasenderSessionStatus> {
    if (!wasenderConfigured()) return 'unknown';
    const result = await request('/api/status', { method: 'GET' });
    if (!result) return 'unknown';
    const status = result.body.status ?? result.body.data?.status;
    return (status as WasenderSessionStatus) ?? 'unknown';
  },

  /**
   * Whether a number is reachable on WhatsApp at all.
   *
   * Deliberately NOT called before sending a code: it is a second request
   * against the same rate limit to learn something the send reports anyway.
   * It is here for diagnosing a specific number that is not receiving.
   */
  async isOnWhatsApp(contact: string): Promise<boolean | null> {
    if (!wasenderConfigured()) return null;
    const result = await request(`/api/on-whatsapp/${encodeURIComponent(contact)}`, {
      method: 'GET',
    });
    if (!result || result.body.success === false) return null;
    return result.body.data?.exists ?? null;
  },
};
