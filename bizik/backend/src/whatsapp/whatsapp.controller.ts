import { Request, Response } from 'express';

import { config } from '../config/env';
import { asyncHandler } from '../lib/errors';
import { WhatsAppClient } from './whatsapp-client';
import { WhatsAppService, type InboundMessage } from './whatsapp.service';

/** Parse a Meta Cloud API message object into our normalised InboundMessage. */
function parseMessage(msg: Record<string, any>): InboundMessage | null {
  const rawFrom: string | undefined = msg.from;
  const waMessageId: string | undefined = msg.id;
  if (!rawFrom || !waMessageId) return null;
  // Meta sends the number WITHOUT a leading '+', but BiZik stores phones in
  // E.164 with '+'. Normalise so WhatsApp users match their existing accounts.
  const phone = rawFrom.startsWith('+') ? rawFrom : `+${rawFrom.replace(/\D/g, '')}`;
  const type: string = msg.type;

  if (type === 'text') {
    return { phone, waMessageId, kind: 'text', text: msg.text?.body ?? '' };
  }
  if (type === 'interactive') {
    const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
    return { phone, waMessageId, kind: 'interactive', text: reply?.id ?? reply?.title ?? '' };
  }
  if (type === 'audio') {
    return { phone, waMessageId, kind: 'audio', mediaId: msg.audio?.id, mimeType: msg.audio?.mime_type };
  }
  if (type === 'image') {
    return { phone, waMessageId, kind: 'image', mediaId: msg.image?.id, mimeType: msg.image?.mime_type, text: msg.image?.caption };
  }
  if (type === 'document') {
    return { phone, waMessageId, kind: 'document', mediaId: msg.document?.id, mimeType: msg.document?.mime_type };
  }
  return { phone, waMessageId, kind: 'other', text: '' };
}

export const WhatsAppController = {
  /** GET webhook - Meta's subscription verification handshake. */
  verify: (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === config.whatsapp.verifyToken && config.whatsapp.verifyToken) {
      return res.status(200).send(String(challenge ?? ''));
    }
    return res.sendStatus(403);
  },

  /** POST webhook - inbound messages/events. Acknowledge fast, process async. */
  receive: asyncHandler(async (req: Request, res: Response) => {
    if (!config.whatsapp.enabled) return res.sendStatus(200);

    const signature = req.header('x-hub-signature-256');
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!WhatsAppClient.verifySignature(rawBody, signature)) {
      // Safe diagnostic (no payload/PII): tells us whether the signature is
      // missing vs. mismatched, and whether these are message vs. status events.
      const kinds = new Set<string>();
      // Identify the sender too: when a SECOND Meta app (or an old test app) is
      // still subscribed to this URL, its events are signed with a different
      // secret and land here forever. The ids below say which number/account
      // they belong to, which is what tells the two apps apart.
      const senders = new Set<string>();
      for (const entry of (req.body?.entry ?? []) as any[]) {
        if (entry.id) senders.add(`waba:${entry.id}`);
        for (const change of entry.changes ?? []) {
          if (change.value?.messages) kinds.add('messages');
          if (change.value?.statuses) kinds.add('statuses');
          const meta = change.value?.metadata;
          if (meta?.phone_number_id) senders.add(`phone_id:${meta.phone_number_id}`);
          if (meta?.display_phone_number) senders.add(`number:${meta.display_phone_number}`);
        }
      }
      console.warn(
        '[whatsapp][401]',
        JSON.stringify({
          path: req.originalUrl,
          hasSig: !!signature,
          sigPrefix: signature ? signature.slice(0, 15) : null,
          rawLen: rawBody?.length ?? 0,
          events: [...kinds],
          from: [...senders],
        }),
      );
      return res.sendStatus(401);
    }

    // Acknowledge immediately so Meta doesn't retry while we run the AI.
    res.sendStatus(200);

    try {
      const entries: any[] = req.body?.entry ?? [];
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          const messages: any[] = change.value?.messages ?? [];
          for (const raw of messages) {
            const parsed = parseMessage(raw);
            if (parsed) {
              WhatsAppService.handleInbound(parsed).catch((error) =>
                console.error('[whatsapp] process error', (error as Error).message),
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('[whatsapp] webhook parse error', (error as Error).message);
    }
  }),
};
