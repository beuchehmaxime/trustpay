import { config } from '../../../config/env';
import {
  CollectionRequest,
  CollectionResponse,
  DisbursementRequest,
  DisbursementResponse,
  NormalisedWebhookEvent,
  PaymentOperation,
  PaymentProviderName,
  PaymentTransactionStatus,
  ProviderTransactionStatus,
} from '../../domain/payment.types';
import {
  ProviderRequestError,
  deliveryForHttpStatus,
  deliveryForTransportError,
} from '../../domain/provider-error';
import { PaymentProvider } from '../../domain/provider.interfaces';

/**
 * Hard ceiling on a single Fapshi call. Without one, `fetch` waits on a silent
 * socket indefinitely and an HTTP request holds a wallet reservation open with
 * no way to decide anything. Timing out turns that hang into an explicit
 * 'unknown' outcome the payment service knows how to handle safely.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/** Map a Fapshi transaction status onto BiZik's payment status. */
const FAPSHI_STATUS: Record<string, PaymentTransactionStatus> = {
  CREATED: 'PROCESSING',
  PENDING: 'PROCESSING',
  SUCCESSFUL: 'SUCCESSFUL',
  FAILED: 'FAILED',
  EXPIRED: 'FAILED',
};

/**
 * Fapshi settles in XAF and its API carries no currency field, so the amount we
 * post IS an XAF amount. Anything else would be paid out in the wrong unit, so
 * the adapter refuses it rather than trusting the caller. Classified `rejected`
 * (never `unknown`): nothing was sent, so reversing the reservation is safe.
 */
function assertXafWholeAmount(amount: string, currency: string | undefined, operation: string): number {
  if (currency && currency !== 'XAF') {
    throw new ProviderRequestError(
      `Fapshi ${operation} refused: settles in XAF only, got ${currency}`,
      'rejected',
      400,
    );
  }
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0 || !Number.isInteger(numeric)) {
    throw new ProviderRequestError(
      `Fapshi ${operation} refused: amount must be a positive whole number of XAF, got ${amount}`,
      'rejected',
      400,
    );
  }
  return numeric;
}

/** Which Fapshi key pair a call uses: a service is collection OR disbursement. */
type FapshiService = 'collection' | 'payout';

/** Fapshi rejects payouts under 100 XAF. */
const FAPSHI_MIN_PAYOUT_XAF = 100;

/** Our provider names, in Fapshi's `medium` vocabulary. */
const FAPSHI_MEDIUM: Record<string, string> = {
  MTN_MOBILE_MONEY: 'mobile money',
  ORANGE_MONEY: 'orange money',
};

/** Fapshi expects the 9 local digits of a Cameroon number (e.g. 6XXXXXXXX). */
function toLocalNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-9); // strips a leading 237 country code (E.164) too
}

interface FapshiInitiateResponse {
  message?: string;
  transId?: string;
  dateInitiated?: string;
}
interface FapshiStatusResponse {
  transId?: string;
  status?: string;
  amount?: number;
  /** What Fapshi actually credited to our service balance, after its cut. */
  revenue?: number;
  medium?: string;
  externalId?: string;
  financialTransId?: string;
}

/**
 * Fapshi payment aggregator adapter (Cameroon mobile money). Handles BOTH MTN
 * and Orange - Fapshi auto-detects the operator from the phone number - so the
 * factory routes both MTN_MOBILE_MONEY and ORANGE_MONEY here. `name` is nominal.
 *
 * Collection = `POST /direct-pay` (prompts the customer's phone), disbursement =
 * `POST /payout`, status = `GET /payment-status/:transId`. Both create calls are
 * asynchronous: we return PROCESSING and let the webhook + reconciliation poll
 * confirm the final SUCCESSFUL/FAILED outcome.
 */
export class FapshiPaymentProvider implements PaymentProvider {
  readonly name: PaymentProviderName = 'MTN_MOBILE_MONEY';

  /** Collections are configured (this is the collection service's key pair). */
  isConfigured(): boolean {
    return Boolean(config.payments.fapshi.apiUser && config.payments.fapshi.apiKey);
  }

  /**
   * Payouts need their OWN Fapshi service and key pair. A Fapshi service is
   * either collection or disbursement, never both, so the collection key cannot
   * pay anyone out - it would simply be refused.
   */
  isPayoutConfigured(): boolean {
    return Boolean(config.payments.fapshi.payoutApiUser && config.payments.fapshi.payoutApiKey);
  }

  private authHeaders(service: FapshiService): Record<string, string> {
    const usePayout = service === 'payout';
    return {
      'Content-Type': 'application/json',
      apiuser: usePayout ? config.payments.fapshi.payoutApiUser : config.payments.fapshi.apiUser,
      apikey: usePayout ? config.payments.fapshi.payoutApiKey : config.payments.fapshi.apiKey,
    };
  }

  private async request<TResponse>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    service: FapshiService = 'collection',
  ): Promise<TResponse> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${config.payments.fapshi.baseUrl}${path}`, {
        method,
        headers: this.authHeaders(service),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: abort.signal,
      });
    } catch (transportError) {
      // No HTTP response came back. Whether the instruction reached Fapshi is
      // the caller's whole decision, so classify it rather than flattening it
      // into a bare Error.
      const aborted = (transportError as Error)?.name === 'AbortError';
      const reason = aborted
        ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
        : ((transportError as Error)?.message ?? 'transport error');
      throw new ProviderRequestError(
        `Fapshi ${method} ${path} ${reason}`,
        aborted ? 'unknown' : deliveryForTransportError(transportError),
      );
    } finally {
      clearTimeout(timer);
    }

    const payload = (await response.json().catch(() => ({}))) as TResponse & { message?: string };
    if (!response.ok) {
      throw new ProviderRequestError(
        `Fapshi ${method} ${path} failed (${response.status}): ${payload.message ?? 'error'}`,
        deliveryForHttpStatus(response.status),
        response.status,
      );
    }
    return payload;
  }

  async initiateCollection(request: CollectionRequest): Promise<CollectionResponse> {
    const amount = assertXafWholeAmount(request.amount, request.currency, 'direct-pay');
    const data = await this.request<FapshiInitiateResponse>('POST', '/direct-pay', {
      amount,
      phone: toLocalNumber(request.customerPhoneNumber),
      externalId: request.transactionReference,
      message: request.description,
    });
    if (!data.transId) throw new Error('Fapshi direct-pay returned no transId');
    console.log(`[fapshi] direct-pay ${request.transactionReference} accepted -> transId=${data.transId}`);
    return { providerReference: data.transId, status: 'PROCESSING' };
  }

  async initiateDisbursement(request: DisbursementRequest): Promise<DisbursementResponse> {
    const amount = assertXafWholeAmount(request.amount, request.currency, 'payout');
    if (!this.isPayoutConfigured()) {
      // Refuse loudly rather than calling with a collection key: Fapshi would
      // reject it, and a caller must never read that as "paid".
      throw new ProviderRequestError(
        'Fapshi payout refused: no disbursement service configured (FAPSHI_PAYOUT_API_USER/KEY)',
        'rejected',
        400,
      );
    }
    if (amount < FAPSHI_MIN_PAYOUT_XAF) {
      throw new ProviderRequestError(
        `Fapshi payout refused: minimum is ${FAPSHI_MIN_PAYOUT_XAF} XAF, got ${amount}`,
        'rejected',
        400,
      );
    }
    const data = await this.request<FapshiInitiateResponse>(
      'POST',
      '/payout',
      {
        amount,
        phone: toLocalNumber(request.recipientPhoneNumber),
        // Tell Fapshi which rail to use instead of letting it guess from the
        // number; the user chose this payout method explicitly.
        ...(FAPSHI_MEDIUM[request.provider ?? ''] ? { medium: FAPSHI_MEDIUM[request.provider ?? ''] } : {}),
        externalId: request.transactionReference,
        message: request.description,
      },
      'payout',
    );
    if (!data.transId) throw new Error('Fapshi payout returned no transId');
    console.log(`[fapshi] payout ${request.transactionReference} accepted -> transId=${data.transId}`);
    return { providerReference: data.transId, status: 'PROCESSING' };
  }

  async getTransactionStatus(
    providerReference: string,
    operation: PaymentOperation,
  ): Promise<ProviderTransactionStatus> {
    // Each service only knows its own transactions, so ask the service that
    // created this one.
    const data = await this.request<FapshiStatusResponse>(
      'GET',
      `/payment-status/${encodeURIComponent(providerReference)}`,
      undefined,
      operation === 'WITHDRAWAL' ? 'payout' : 'collection',
    );
    const status = FAPSHI_STATUS[data.status ?? ''] ?? 'PROCESSING';
    return {
      providerReference,
      status,
      providerTransactionId: data.financialTransId,
      failureReason: status === 'FAILED' ? (data.status ?? 'FAILED') : undefined,
      amount: typeof data.amount === 'number' ? data.amount : undefined,
      // Fapshi reports both sides of its cut: `amount` is what moved, `revenue`
      // is what reached us. The difference is the only authoritative figure for
      // what the rail charged, and it exists only after settlement.
      providerFee:
        typeof data.amount === 'number' && typeof data.revenue === 'number'
          ? Number((data.amount - data.revenue).toFixed(4))
          : undefined,
      transactionReference: data.externalId,
    };
  }

  /**
   * Balance of the disbursement service. Payouts are paid out of this balance,
   * so it running dry is an operational failure worth seeing before users do.
   */
  async getPayoutBalance(): Promise<{ balance: number; currency: string }> {
    const data = await this.request<{ balance?: number; currency?: string }>(
      'GET',
      '/balance',
      undefined,
      'payout',
    );
    return { balance: Number(data.balance ?? 0), currency: data.currency ?? 'XAF' };
  }

  parseWebhook(rawPayload: unknown): NormalisedWebhookEvent {
    const body = (rawPayload ?? {}) as FapshiStatusResponse;
    return {
      provider: this.name,
      providerReference: body.transId,
      transactionReference: body.externalId,
      status: FAPSHI_STATUS[body.status ?? ''] ?? 'PROCESSING',
      providerTransactionId: body.financialTransId,
      externalId: `fapshi:${body.transId ?? 'unknown'}:${body.status ?? 'unknown'}`,
      eventType: `payment.${(body.status ?? 'unknown').toLowerCase()}`,
    };
  }
}
