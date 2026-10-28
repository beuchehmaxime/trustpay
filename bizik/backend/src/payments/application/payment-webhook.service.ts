import crypto from 'crypto';

import { PaymentGateway, Prisma } from '@prisma/client';

import { config } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { PaymentProviderName } from '../domain/payment.types';
import { PaymentService } from './payment.service';
import { PaymentProviderFactory } from './payment-provider.factory';
import { PaymentRepository } from '../persistence/payment.repository';

/** Constant-time string comparison (avoids leaking the secret via timing). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Map a BiZik provider onto the (broader) PaymentGateway enum for webhook rows. */
const GATEWAY_BY_PROVIDER: Record<PaymentProviderName, PaymentGateway> = {
  MTN_MOBILE_MONEY: 'MTN_MOMO',
  ORANGE_MONEY: 'ORANGE_MONEY',
  BANK: 'BANK_TRANSFER',
};

/**
 * Inbound provider callbacks. The controller stays thin - all logic lives here.
 * Every event is first recorded in `gateway_webhooks` (its `externalId` is a
 * UNIQUE dedup key), so a provider retrying a callback can never double-process.
 * The actual money move is delegated to the idempotent PaymentService.
 */
export const PaymentWebhookService = {
  async process(providerName: PaymentProviderName, rawPayload: unknown): Promise<void> {
    // These callbacks carry no shared secret and the direct MTN/Orange adapters
    // are not the live rail (mobile money goes through Fapshi). Accepting them
    // in live mode only offers an unauthenticated way to fill `gateway_webhooks`
    // with attacker-supplied JSON and to squat dedup keys, so they are refused.
    if (config.payments.mode === 'live') {
      console.warn(`[webhook:${providerName}] ignored - unauthenticated callback disabled in live mode`);
      return;
    }
    const parser = PaymentProviderFactory.getWebhookParser(providerName);
    const event = parser.parseWebhook(rawPayload);

    // Record + de-duplicate. A duplicate externalId means we already saw this
    // event → stop here.
    try {
      await prisma.gatewayWebhook.create({
        data: {
          gateway: GATEWAY_BY_PROVIDER[providerName],
          eventType: event.eventType,
          externalId: event.externalId,
          payload: (rawPayload ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return; // already processed this exact event
      }
      throw error;
    }

    // Correlate to our PaymentTransaction by provider reference, else our own ref.
    let paymentTransaction = event.providerReference
      ? await PaymentRepository.findByProviderReference(event.providerReference)
      : null;
    if (!paymentTransaction && event.transactionReference) {
      paymentTransaction = await PaymentRepository.findByTransactionReference(event.transactionReference);
    }
    if (!paymentTransaction) return; // unknown/foreign event - safely ignored

    // SECURITY: the webhook body is unauthenticated and could be forged, so we
    // NEVER move money based on the posted status. Instead we treat the callback
    // purely as a signal to re-query the provider's status API and settle only
    // on a provider-confirmed outcome. `pollAndSettle` verifies with the provider
    // (getTransactionStatus) and is idempotent + a no-op unless PROCESSING, so a
    // forged "SUCCESSFUL" POST triggers a real check that won't credit anything.
    if (paymentTransaction.status === 'PROCESSING' && paymentTransaction.providerReference) {
      await PaymentService.pollAndSettle(paymentTransaction);
    }

    await prisma.gatewayWebhook.update({
      where: { externalId: event.externalId },
      data: { processed: true },
    });
  },

  /**
   * Fapshi callback (mobile money). Verifies the shared `x-wh-secret`, correlates
   * the event to our PaymentTransaction (by Fapshi transId, else our externalId),
   * and - never trusting the payload - re-queries Fapshi via pollAndSettle before
   * moving any money. Idempotent, so a replayed webhook is harmless.
   */
  async processFapshi(secretHeader: string | undefined, rawPayload: unknown): Promise<void> {
    const expectedSecret = config.payments.fapshi.webhookSecret;
    // Fail closed in live mode: an unauthenticated webhook must not be processed.
    if (config.payments.mode === 'live' && !expectedSecret) {
      console.error('[webhook:fapshi] rejected - FAPSHI_WEBHOOK_SECRET is not set in live mode');
      return;
    }
    if (expectedSecret && !timingSafeEqualStr(secretHeader ?? '', expectedSecret)) {
      console.warn('[webhook:fapshi] rejected - bad x-wh-secret');
      return;
    }

    const body = (rawPayload ?? {}) as { transId?: string; externalId?: string };
    let paymentTransaction = body.transId
      ? await PaymentRepository.findByProviderReference(body.transId)
      : null;
    if (!paymentTransaction && body.externalId) {
      paymentTransaction = await PaymentRepository.findByTransactionReference(body.externalId);
    }
    if (!paymentTransaction) return; // unknown/foreign event - safely ignored

    // Record the callback AFTER correlating it to a real transaction, so an
    // unknown or forged event cannot grow this table or squat a dedup key. The
    // unique externalId also makes a replayed delivery a no-op.
    const eventKey = `fapshi:${paymentTransaction.transactionReference}:${String(
      (rawPayload as { status?: string } | null)?.status ?? 'unknown',
    )}`;
    try {
      await prisma.gatewayWebhook.create({
        data: {
          gateway: 'MTN_MOMO',
          eventType: 'fapshi.status',
          externalId: eventKey,
          payload: (rawPayload ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return; // already handled this exact callback
      }
      throw error;
    }

    if (paymentTransaction.status === 'PROCESSING' && paymentTransaction.providerReference) {
      await PaymentService.pollAndSettle(paymentTransaction);
    }
    await prisma.gatewayWebhook.update({ where: { externalId: eventKey }, data: { processed: true } });
  },
};
