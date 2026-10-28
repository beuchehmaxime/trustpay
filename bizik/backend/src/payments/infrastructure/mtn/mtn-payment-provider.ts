import {
  CollectionRequest,
  CollectionResponse,
  DisbursementRequest,
  DisbursementResponse,
  NormalisedWebhookEvent,
  PaymentOperation,
  PaymentProviderName,
  ProviderTransactionStatus,
} from '../../domain/payment.types';
import { PaymentProvider } from '../../domain/provider.interfaces';
import { getMtnConfiguration, isProductConfigured, MtnConfiguration } from './mtn.config';
import { MtnClient } from './mtn-client';
import { MtnAccessTokenCache } from './mtn-token-cache';
import { MtnAuthenticationService } from './mtn-authentication.service';
import { MtnCollectionService } from './mtn-collection.service';
import { MtnDisbursementService } from './mtn-disbursement.service';
import { mapMtnStatus } from './mtn-status.mapper';

/**
 * MTN Mobile Money adapter. Implements BiZik's provider contract by delegating
 * to the Collection (deposits) and Disbursement (withdrawals) products. The rest
 * of BiZik never imports this class directly - only via the provider factory.
 */
export class MtnPaymentProvider implements PaymentProvider {
  readonly name: PaymentProviderName = 'MTN_MOBILE_MONEY';

  private readonly mtnConfiguration: MtnConfiguration;
  private readonly collectionService: MtnCollectionService;
  private readonly disbursementService: MtnDisbursementService;

  constructor() {
    this.mtnConfiguration = getMtnConfiguration();
    const mtnClient = new MtnClient(this.mtnConfiguration.baseUrl);
    const tokenCache = new MtnAccessTokenCache();
    const authenticationService = new MtnAuthenticationService(this.mtnConfiguration, tokenCache);
    this.collectionService = new MtnCollectionService(
      mtnClient,
      authenticationService,
      this.mtnConfiguration,
    );
    this.disbursementService = new MtnDisbursementService(
      mtnClient,
      authenticationService,
      this.mtnConfiguration,
    );
  }

  isConfigured(): boolean {
    return (
      isProductConfigured(this.mtnConfiguration.collection) ||
      isProductConfigured(this.mtnConfiguration.disbursement)
    );
  }

  initiateCollection(request: CollectionRequest): Promise<CollectionResponse> {
    return this.collectionService.requestToPay(request);
  }

  initiateDisbursement(request: DisbursementRequest): Promise<DisbursementResponse> {
    return this.disbursementService.transfer(request);
  }

  getTransactionStatus(
    providerReference: string,
    operation: PaymentOperation,
  ): Promise<ProviderTransactionStatus> {
    return operation === 'DEPOSIT'
      ? this.collectionService.getStatus(providerReference)
      : this.disbursementService.getStatus(providerReference);
  }

  /**
   * Parse an MTN callback. MTN echoes our `externalId` (= transactionReference)
   * and reports the final `status`; the reference id may arrive in the body or
   * be absent, so we surface both correlation keys and let the webhook service
   * match on whichever is present. Reconciliation remains the source of truth.
   */
  parseWebhook(rawPayload: unknown): NormalisedWebhookEvent {
    const body = (rawPayload ?? {}) as Record<string, unknown>;
    const referenceId = typeof body.referenceId === 'string' ? body.referenceId : undefined;
    const externalRef = typeof body.externalId === 'string' ? body.externalId : undefined;
    const financialTransactionId =
      typeof body.financialTransactionId === 'string' ? body.financialTransactionId : undefined;
    const reason = body.reason;

    return {
      provider: this.name,
      providerReference: referenceId,
      transactionReference: externalRef,
      status: mapMtnStatus(typeof body.status === 'string' ? body.status : undefined),
      providerTransactionId: financialTransactionId,
      failureReason:
        typeof reason === 'string'
          ? reason
          : ((reason as { message?: string } | undefined)?.message ?? undefined),
      externalId:
        referenceId ??
        financialTransactionId ??
        `${externalRef ?? 'mtn'}:${String(body.status ?? 'event')}`,
      eventType: 'mtn.transaction',
    };
  }
}
