import crypto from 'crypto';

import {
  CollectionRequest,
  CollectionResponse,
  ProviderTransactionStatus,
} from '../../domain/payment.types';
import { MtnConfiguration } from './mtn.config';
import { MtnClient } from './mtn-client';
import { MtnAuthenticationService } from './mtn-authentication.service';
import { mapMtnStatus } from './mtn-status.mapper';

/**
 * MTN Collection product - pulling money IN from a customer's MoMo account.
 *
 * `requestToPay` is ASYNCHRONOUS: MTN replies 202 Accepted, prompts the customer
 * to approve on their handset, and the final result arrives later (webhook or a
 * status poll). So the initial response is always PROCESSING - never crediting.
 * Docs: MTN MoMo `POST /collection/v1_0/requesttopay`.
 */
export class MtnCollectionService {
  constructor(
    private readonly mtnClient: MtnClient,
    private readonly authenticationService: MtnAuthenticationService,
    private readonly mtnConfiguration: MtnConfiguration,
  ) {}

  async requestToPay(request: CollectionRequest): Promise<CollectionResponse> {
    const accessToken = await this.authenticationService.getCollectionToken();
    // The X-Reference-Id we generate IS the provider reference we later poll on.
    const providerReference = crypto.randomUUID();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'X-Reference-Id': providerReference,
      'X-Target-Environment': this.mtnConfiguration.environment,
      'Ocp-Apim-Subscription-Key': this.mtnConfiguration.collection.subscriptionKey,
    };
    if (this.mtnConfiguration.callbackUrl) {
      headers['X-Callback-Url'] = this.mtnConfiguration.callbackUrl;
    }

    // MTN's SANDBOX only accepts EUR; production uses the real currency (XAF …).
    const chargeCurrency = this.mtnConfiguration.environment === 'sandbox' ? 'EUR' : request.currency;

    await this.mtnClient.http.post(
      '/collection/v1_0/requesttopay',
      {
        amount: request.amount,
        currency: chargeCurrency,
        externalId: request.transactionReference,
        payer: { partyIdType: 'MSISDN', partyId: request.customerPhoneNumber },
        payerMessage: request.description,
        payeeNote: 'BiZik wallet deposit',
      },
      { headers },
    );

    console.log(
      `[mtn:${this.mtnConfiguration.environment}] COLLECTION requesttopay accepted -> ref=${providerReference} amount=${request.amount} ${chargeCurrency} payer=${request.customerPhoneNumber} extId=${request.transactionReference}`,
    );
    return { providerReference, status: 'PROCESSING' };
  }

  async getStatus(providerReference: string): Promise<ProviderTransactionStatus> {
    const accessToken = await this.authenticationService.getCollectionToken();
    const { data } = await this.mtnClient.http.get<{
      status?: string;
      financialTransactionId?: string;
      reason?: string | { code?: string; message?: string };
    }>(`/collection/v1_0/requesttopay/${providerReference}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Target-Environment': this.mtnConfiguration.environment,
        'Ocp-Apim-Subscription-Key': this.mtnConfiguration.collection.subscriptionKey,
      },
    });

    console.log(
      `[mtn:${this.mtnConfiguration.environment}] COLLECTION status ref=${providerReference} -> ${data.status ?? '(none)'}`,
    );
    return {
      providerReference,
      status: mapMtnStatus(data.status),
      providerTransactionId: data.financialTransactionId,
      failureReason:
        typeof data.reason === 'string' ? data.reason : data.reason?.message ?? data.reason?.code,
    };
  }
}
