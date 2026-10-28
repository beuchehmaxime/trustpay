import crypto from 'crypto';

import {
  CollectionRequest,
  CollectionResponse,
  DisbursementRequest,
  DisbursementResponse,
  NormalisedWebhookEvent,
  PaymentProviderName,
  PaymentTransactionStatus,
  ProviderTransactionStatus,
} from '../../domain/payment.types';
import { PaymentProvider } from '../../domain/provider.interfaces';

/**
 * In-process fake gateway. Lets the entire deposit/withdrawal lifecycle run with
 * NO credentials (dev, demos, CI). It resolves SYNCHRONOUSLY (unlike real MoMo),
 * so a deposit completes immediately - matching BiZik's pre-existing behaviour.
 *
 * Deterministic failure hook (kept from the old adapter): any amount whose minor
 * units end in `.13` fails, so tests can exercise the failure path predictably.
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  constructor(readonly name: PaymentProviderName) {}

  isConfigured(): boolean {
    return true; // the simulator is always "configured"
  }

  private declines(amount: string): boolean {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return false;
    return Math.round(numericAmount * 100) % 100 === 13;
  }

  async initiateCollection(request: CollectionRequest): Promise<CollectionResponse> {
    const providerReference = `sim_col_${crypto.randomUUID()}`;
    const status: PaymentTransactionStatus = this.declines(request.amount) ? 'FAILED' : 'SUCCESSFUL';
    return { providerReference, status };
  }

  async initiateDisbursement(request: DisbursementRequest): Promise<DisbursementResponse> {
    const providerReference = `sim_dis_${crypto.randomUUID()}`;
    const status: PaymentTransactionStatus = this.declines(request.amount) ? 'FAILED' : 'SUCCESSFUL';
    return { providerReference, status };
  }

  async getTransactionStatus(providerReference: string): Promise<ProviderTransactionStatus> {
    // The simulator settles synchronously, so anything still being polled has
    // succeeded (there is no pending state to resolve).
    return { providerReference, status: 'SUCCESSFUL' };
  }
  // (operation param accepted per the interface; unused by the simulator)

  /**
   * Accepts a hand-crafted webhook body of the same normalised shape (used only
   * for simulator-mode webhook tests): `{ providerReference, status, externalId? }`.
   */
  parseWebhook(rawPayload: unknown): NormalisedWebhookEvent {
    const body = (rawPayload ?? {}) as Record<string, unknown>;
    const providerReference = String(body.providerReference ?? '');
    const status = (String(body.status ?? 'SUCCESSFUL') as PaymentTransactionStatus) ?? 'SUCCESSFUL';
    return {
      provider: this.name,
      providerReference,
      status,
      externalId: String(body.externalId ?? `sim_evt_${providerReference}`),
      eventType: String(body.eventType ?? 'simulated'),
    };
  }
}
