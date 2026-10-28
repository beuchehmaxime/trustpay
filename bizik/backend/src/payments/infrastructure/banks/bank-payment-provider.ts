import {
  CollectionRequest,
  CollectionResponse,
  NormalisedWebhookEvent,
  PaymentProviderName,
  ProviderTransactionStatus,
} from '../../domain/payment.types';
import { CollectionProvider, PaymentStatusProvider, WebhookParsingProvider } from '../../domain/provider.interfaces';

/**
 * Bank rail adapter - SCAFFOLD.
 *
 * Banks vary widely: some support inbound collection but NOT an instant
 * disbursement API. That is exactly why the capability interfaces are segregated
 * - this adapter implements only `CollectionProvider` (+ status/webhook) and
 * simply is not registered as a disbursement provider. Real endpoints are filled
 * per-bank during that integration phase.
 */
export class BankPaymentProvider
  implements CollectionProvider, PaymentStatusProvider, WebhookParsingProvider
{
  readonly name: PaymentProviderName = 'BANK';

  isConfigured(): boolean {
    return false;
  }

  async initiateCollection(_request: CollectionRequest): Promise<CollectionResponse> {
    throw new Error('BankPaymentProvider.initiateCollection is not implemented yet.');
  }

  async getTransactionStatus(_providerReference: string): Promise<ProviderTransactionStatus> {
    throw new Error('BankPaymentProvider.getTransactionStatus is not implemented yet.');
  }

  parseWebhook(_rawPayload: unknown): NormalisedWebhookEvent {
    throw new Error('BankPaymentProvider.parseWebhook is not implemented yet.');
  }
}
