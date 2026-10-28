import {
  CollectionRequest,
  CollectionResponse,
  DisbursementRequest,
  DisbursementResponse,
  NormalisedWebhookEvent,
  PaymentOperation,
  PaymentProviderName,
  ProviderTransactionStatus,
} from './payment.types';

/**
 * Provider capability interfaces (Interface Segregation). A provider implements
 * only what it supports - a bank might do collection but not instant
 * disbursement, so we never force one fat interface on every adapter.
 */

/** Pull money in from a customer (deposits). */
export interface CollectionProvider {
  readonly name: PaymentProviderName;
  initiateCollection(request: CollectionRequest): Promise<CollectionResponse>;
}

/** Push money out to a recipient (withdrawals). */
export interface DisbursementProvider {
  readonly name: PaymentProviderName;
  initiateDisbursement(request: DisbursementRequest): Promise<DisbursementResponse>;
}

/** Query the current status of a provider transaction (reconciliation). */
export interface PaymentStatusProvider {
  readonly name: PaymentProviderName;
  getTransactionStatus(
    providerReference: string,
    operation: PaymentOperation,
  ): Promise<ProviderTransactionStatus>;
}

/** Parse this provider's raw webhook body into BiZik's normalised event. */
export interface WebhookParsingProvider {
  readonly name: PaymentProviderName;
  parseWebhook(rawPayload: unknown): NormalisedWebhookEvent;
}

/**
 * A full provider adapter. Individual services depend on the narrow capability
 * interfaces above (Dependency Inversion); this composite is only used by the
 * factory to register a provider.
 */
export interface PaymentProvider
  extends CollectionProvider,
    DisbursementProvider,
    PaymentStatusProvider,
    WebhookParsingProvider {
  /** Whether this adapter is fully configured (credentials present). */
  isConfigured(): boolean;
}
