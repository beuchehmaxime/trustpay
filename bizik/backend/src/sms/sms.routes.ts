import { Router } from 'express';

import { asyncHandler } from '../lib/errors';
import { maskNumber } from '../lib/sms-providers/types';

/**
 * Orange delivery receipts.
 *
 * Orange answers 201 the moment it ACCEPTS a message, not when it arrives, so
 * without this endpoint "sent" and "delivered" are indistinguishable - which is
 * exactly the blind spot that hid a month of failed codes. Orange posts the
 * real outcome here within 24 hours.
 *
 * Register this URL with Orange (their support form) as:
 *   https://api.bizik.cm/api/v1/sms/webhooks/orange/dr
 * It must be https on port 443 with a real certificate, and must answer 200 -
 * Orange does not retry.
 *
 * The payload carries no secret and cannot be authenticated - Orange does not
 * sign delivery receipts and offers no shared token - so it is treated as a
 * REPORT, never as an instruction: it is logged and nothing else. No database
 * row is written, no message is resent, no account is touched, and nothing here
 * decides whether a code is valid. A forged one can only produce a single
 * sanitised, misleading log line.
 *
 * Two things keep even that from being worth doing: every field is stripped of
 * control characters and truncated before it reaches a log, and the route is
 * mounted with a 16 KB body limit rather than the 20 MB the KYC upload path
 * needs, so it cannot be used to make the server parse bulk.
 */
const router = Router();

interface OrangeDeliveryNotification {
  deliveryInfoNotification?: {
    callbackData?: string;
    deliveryInfo?: { address?: string; deliveryStatus?: string };
  };
}

/**
 * The five statuses Orange documents, and what each actually means.
 *
 * Worth spelling out, because two of them read like failures and are not.
 * `DeliveryUncertain` means Orange handed the message to ANOTHER network and
 * lost sight of it - common for MTN numbers, and not evidence of a problem.
 * Even `DeliveryImpossible` may still arrive later (a phone off the network for
 * a day), and Orange says explicitly that none of these statuses is grounds for
 * an incident. Treating "uncertain" as failure would have had us chasing a
 * fault every time we messaged a non-Orange number.
 */
type ReceiptOutcome = 'delivered' | 'failed' | 'pending' | 'unknown';

const STATUS_OUTCOME: Record<string, ReceiptOutcome> = {
  // The only one that proves the handset got it.
  DeliveredToTerminal: 'delivered',
  // Accepted by the network; the handset has not confirmed yet.
  DeliveredToNetwork: 'pending',
  MessageWaiting: 'pending',
  // Expired without arriving. May still land later, per Orange.
  DeliveryImpossible: 'failed',
  // Handed to another operator, so Orange cannot say. Not a failure.
  DeliveryUncertain: 'unknown',
};

/**
 * Everything below U+0020, plus DEL. Newlines and carriage returns are the ones
 * that matter: they are what would split one report into several log lines.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

/**
 * Make an attacker-supplied string safe to put in a log line.
 *
 * Every field in this payload is attacker-supplied, because the endpoint cannot
 * be authenticated. A newline in one of them would let anyone who found the URL
 * write whatever they liked into the server log - forging, say, a line that
 * reads like a successful admin sign-in. Flattening control characters and
 * capping the length holds a forged report to exactly one line.
 */
function forLog(value: unknown, max = 64): string {
  if (typeof value !== 'string') return '-';
  const flattened = value.replace(CONTROL_CHARACTERS, ' ').trim();
  if (!flattened) return '-';
  return flattened.length > max ? `${flattened.slice(0, max)}...` : flattened;
}

/**
 * Turn a receipt into the one line it is allowed to produce.
 *
 * Pure and exported so the sanitising can be tested without standing up an HTTP
 * server - the interesting behaviour here is entirely "what does a hostile
 * payload turn into", not routing.
 */
export function describeReceipt(payload: unknown): { line: string; outcome: ReceiptOutcome } {
  const body = (payload ?? {}) as OrangeDeliveryNotification;
  const info = body.deliveryInfoNotification?.deliveryInfo;
  const rawStatus = info?.deliveryStatus;
  const status = forLog(rawStatus, 32);
  const address = forLog(info?.address, 24).replace(/^tel:/, '');
  // Orange puts the resource id of the original send in `callbackData`, which
  // is what ties a receipt back to the message that produced it.
  const reference = forLog(body.deliveryInfoNotification?.callbackData);

  // Read from the RAW value, never the sanitised one: a string cleaned up for
  // display must not be what a decision is made on.
  const outcome: ReceiptOutcome =
    typeof rawStatus === 'string' ? (STATUS_OUTCOME[rawStatus] ?? 'unknown') : 'unknown';

  return {
    line: `[sms:dr] orange ${status} (${outcome}) for ${maskNumber(address)} (ref ${reference})`,
    outcome,
  };
}

router.post(
  '/webhooks/orange/dr',
  asyncHandler(async (req, res) => {
    const { line, outcome } = describeReceipt(req.body);
    if (outcome === 'failed') {
      // Worth surfacing: a code that never landed looks identical to a user
      // typing the wrong one unless this is visible.
      console.error(`${line} - it expired before reaching the handset`);
    } else {
      console.log(line);
    }

    // Orange ignores every response except 200, and never retries.
    res.status(200).json({ received: true });
  }),
);

export default router;
