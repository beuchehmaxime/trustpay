import crypto from 'crypto';

import { config } from '../config/env';
import { tidyMarkup } from './whatsapp-format';

/**
 * Thin client for Meta's WhatsApp Cloud API (Graph). Sends text, interactive
 * button/list menus, and documents; downloads inbound media; and verifies the
 * inbound webhook signature. All calls are best-effort and never throw into the
 * request path - a failed send is logged, not fatal.
 */

const GRAPH = () => `https://graph.facebook.com/${config.whatsapp.graphVersion}`;

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.whatsapp.accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Meta error codes that mean the message will NOT reach the person, so the
 * caller should fall back to another channel (SMS) instead of assuming success:
 *  131047 - outside the 24-hour service window; needs an approved template
 *  131026 - the number can't receive WhatsApp messages
 *  131030 - not in the app's allowed-recipient list (test numbers)
 *  131051 - unsupported message type for this recipient
 */
export const UNDELIVERABLE_CODES = new Set([131047, 131026, 131030, 131051]);

export interface SendResult {
  ok: boolean;
  id?: string;
  /** Meta error code when a send is rejected (e.g. 131026 not-on-WhatsApp,
   *  131047 outside the 24h window / needs a template, 131030 not allow-listed). */
  errorCode?: number;
  errorMessage?: string;
}

async function post(body: unknown): Promise<SendResult> {
  if (!config.whatsapp.enabled || !config.whatsapp.phoneNumberId) return { ok: false };
  try {
    const response = await fetch(`${GRAPH()}/${config.whatsapp.phoneNumberId}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ messaging_product: 'whatsapp', ...(body as object) }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };
    if (!response.ok) {
      const code = payload.error?.code;
      // 131047 in particular is the everyday one: we may only send free-form
      // text within 24h of the person's last message. Say so plainly in the log
      // so it isn't mistaken for an outage.
      const hint =
        code === 131047
          ? ' (outside the 24-hour window - needs an approved template)'
          : code === 131030
            ? ' (recipient not in the app allow-list)'
            : '';
      console.error('[whatsapp] send failed', response.status, code, payload.error?.message, hint);
      return { ok: false, errorCode: code, errorMessage: payload.error?.message };
    }
    return { ok: true, id: payload.messages?.[0]?.id };
  } catch (error) {
    console.error('[whatsapp] send error', (error as Error).message);
    return { ok: false, errorMessage: (error as Error).message };
  }
}

export interface QuickReply {
  id: string;
  title: string; // ≤ 20 chars
}

export interface ListRow {
  id: string;
  title: string; // ≤ 24 chars
  description?: string; // ≤ 72 chars
}

export const WhatsAppClient = {
  /** Plain text message. */
  sendText(to: string, text: string) {
    const body = tidyMarkup(text).slice(0, 4096);
    return post({ to, type: 'text', text: { body, preview_url: false } });
  },

  /** Up to 3 reply buttons under a body of text. */
  sendButtons(to: string, text: string, buttons: QuickReply[]) {
    return post({
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: tidyMarkup(text).slice(0, 1024) },
        action: {
          buttons: buttons.slice(0, 3).map((button) => ({
            type: 'reply',
            reply: { id: button.id, title: button.title.slice(0, 20) },
          })),
        },
      },
    });
  },

  /** A tappable list menu (up to 10 rows) - good for the main menu / pickers. */
  sendList(to: string, text: string, buttonLabel: string, rows: ListRow[], sectionTitle = 'Options') {
    return post({
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: tidyMarkup(text).slice(0, 1024) },
        action: {
          button: buttonLabel.slice(0, 20),
          sections: [
            {
              title: sectionTitle.slice(0, 24),
              rows: rows.slice(0, 10).map((row) => ({
                id: row.id,
                title: row.title.slice(0, 24),
                description: row.description?.slice(0, 72),
              })),
            },
          ],
        },
      },
    });
  },

  /** Send a document (e.g. the receipt PDF) by public link or uploaded media id. */
  sendDocument(to: string, opts: { link?: string; mediaId?: string; filename: string; caption?: string }) {
    return post({
      to,
      type: 'document',
      document: {
        ...(opts.link ? { link: opts.link } : {}),
        ...(opts.mediaId ? { id: opts.mediaId } : {}),
        filename: opts.filename,
        caption: opts.caption,
      },
    });
  },

  /**
   * Send a pre-approved template (required to message a user outside the 24h
   * customer-service window - e.g. proactive "deal funded" notifications).
   */
  sendTemplate(to: string, name: string, languageCode: string, params: string[] = []) {
    return post({
      to,
      type: 'template',
      template: {
        name,
        language: { code: languageCode },
        ...(params.length
          ? {
              components: [
                { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) },
              ],
            }
          : {}),
      },
    });
  },

  /** Download inbound media (voice note, KYC/delivery image) by media id → bytes. */
  async downloadMedia(mediaId: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
    try {
      const metaRes = await fetch(`${GRAPH()}/${mediaId}`, { headers: authHeaders() });
      if (!metaRes.ok) return null;
      const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
      if (!meta.url) return null;
      const fileRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
      });
      if (!fileRes.ok) return null;
      const bytes = Buffer.from(await fileRes.arrayBuffer());
      return { bytes, mimeType: meta.mime_type ?? 'application/octet-stream' };
    } catch (error) {
      console.error('[whatsapp] media download error', (error as Error).message);
      return null;
    }
  },

  /** Verify the inbound webhook HMAC (X-Hub-Signature-256 over the raw body). */
  verifySignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
    const secret = config.whatsapp.appSecret;
    if (!secret) {
      // Without the app secret we cannot tell Meta apart from anyone who found
      // the URL, and this endpoint acts on whatever phone number the body
      // claims. So a LIVE channel with no secret accepts nothing; only a
      // switched-off channel (whose route 200s and drops the payload anyway)
      // is allowed through unverified.
      if (config.whatsapp.enabled) {
        console.error(
          '[whatsapp][config] WHATSAPP_APP_SECRET is not set - inbound webhooks are being REJECTED. Set it to the app secret of the Meta app that owns this number.',
        );
        return false;
      }
      return true;
    }
    if (!rawBody || !signatureHeader) return false;
    const expected =
      'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },
};
