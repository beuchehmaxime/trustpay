import crypto from 'crypto';

import {
  DisbursementRequest,
  DisbursementResponse,
  ProviderTransactionStatus,
} from '../../domain/payment.types';
import { MtnConfiguration } from './mtn.config';
import { MtnClient } from './mtn-client';
import { MtnAuthenticationService } from './mtn-authentication.service';
import { mapMtnStatus } from './mtn-status.mapper';

/**
 * MTN Disbursement product - pushing money OUT to a recipient's MoMo account
 * (withdrawals). Like collection it is asynchronous (202 Accepted, result later).
 * The partner Disbursement account must be pre-funded by MTN for transfers to
 * succeed - a business/onboarding requirement, not a code concern.
 * Docs: MTN MoMo `POST /disbursement/v1_0/transfer`.
 */
export class MtnDisbursementService {
  constructor(
    private readonly mtnClient: MtnClient,
    private readonly authenticationService: MtnAuthenticationService,
    private readonly mtnConfiguration: MtnConfiguration,
  ) {}

  async transfer(request: DisbursementRequest): Promise<DisbursementResponse> {
    const accessToken = await this.authenticationService.getDisbursementToken();
    const providerReference = crypto.randomUUID();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'X-Reference-Id': providerReference,
      'X-Target-Environment': this.mtnConfiguration.environment,
      'Ocp-Apim-Subscription-Key': this.mtnConfiguration.disbursement.subscriptionKey,
    };
    if (this.mtnConfiguration.callbackUrl) {
      headers['X-Callback-Url'] = this.mtnConfiguration.callbackUrl;
    }

    // MTN's SANDBOX only accepts EUR; production uses the real currency (XAF …).
    const chargeCurrency = this.mtnConfiguration.environment === 'sandbox' ? 'EUR' : request.currency;

    await this.mtnClient.http.post(
      '/disbursement/v1_0/transfer',
      {
        amount: request.amount,
        currency: chargeCurrency,
        externalId: request.transactionReference,
        payee: { partyIdType: 'MSISDN', partyId: request.recipientPhoneNumber },
        payerMessage: request.description,
        payeeNote: 'BiZik wallet withdrawal',
      },
      { headers },
    );

    console.log(
      `[mtn:${this.mtnConfiguration.environment}] DISBURSEMENT transfer accepted -> ref=${providerReference} amount=${request.amount} ${chargeCurrency} payee=${request.recipientPhoneNumber} extId=${request.transactionReference}`,
    );
    return { providerReference, status: 'PROCESSING' };
  }

  async getStatus(providerReference: string): Promise<ProviderTransactionStatus> {
    const accessToken = await this.authenticationService.getDisbursementToken();
    const { data } = await this.mtnClient.http.get<{
      status?: string;
      financialTransactionId?: string;
      reason?: string | { code?: string; message?: string };
    }>(`/disbursement/v1_0/transfer/${providerReference}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Target-Environment': this.mtnConfiguration.environment,
        'Ocp-Apim-Subscription-Key': this.mtnConfiguration.disbursement.subscriptionKey,
      },
    });

    console.log(
      `[mtn:${this.mtnConfiguration.environment}] DISBURSEMENT status ref=${providerReference} -> ${data.status ?? '(none)'}`,
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
