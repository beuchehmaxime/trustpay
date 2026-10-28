import {
  CollectionRequest,
  CollectionResponse,
  DisbursementRequest,
  DisbursementResponse,
  NormalisedWebhookEvent,
  PaymentProviderName,
  ProviderTransactionStatus,
} from '../../domain/payment.types';
import { PaymentProvider } from '../../domain/provider.interfaces';

/**
 * Orange Money adapter - SCAFFOLD.
 *
 * Orange Cameroon exposes its own Web Payment / Orange Money API (OAuth client
 * credentials + merchant key) with a different request/response shape from MTN;
 * we deliberately do NOT fake it against MTN's structure. Until the merchant
 * onboarding + real endpoints are wired, `isConfigured()` is false and the
 * factory routes Orange traffic to the simulator instead. The method bodies stay
 * throwing so a half-configured Orange can never silently mis-handle money.
 */
export class OrangePaymentProvider implements PaymentProvider {
  readonly name: PaymentProviderName = 'ORANGE_MONEY';

  isConfigured(): boolean {
    // The Orange adapter methods are not implemented yet - every call throws. If
    // this returned true once env vars were set, the factory would route REAL
    // money traffic to a throwing stub in live mode. Force `false` so Orange
    // always falls back to the simulator until the real integration lands.
    return false;
  }

  async initiateCollection(_request: CollectionRequest): Promise<CollectionResponse> {
    throw new Error('OrangePaymentProvider.initiateCollection is not implemented yet.');
  }

  async initiateDisbursement(_request: DisbursementRequest): Promise<DisbursementResponse> {
    throw new Error('OrangePaymentProvider.initiateDisbursement is not implemented yet.');
  }

  async getTransactionStatus(_providerReference: string): Promise<ProviderTransactionStatus> {
    throw new Error('OrangePaymentProvider.getTransactionStatus is not implemented yet.');
  }

  parseWebhook(_rawPayload: unknown): NormalisedWebhookEvent {
    throw new Error('OrangePaymentProvider.parseWebhook is not implemented yet.');
  }
}
