/**
 * Why a provider call failed - and, the part that decides whether money moves,
 * WHETHER THE PROVIDER MIGHT HAVE ACTED ANYWAY.
 *
 * A payout request that comes back "connection reset" is not the same event as
 * one the provider answered with "400 bad phone number". The second is a refusal
 * we can act on: nothing was disbursed, so the reservation must be refunded. The
 * first tells us nothing - the request may have arrived, been accepted, and paid
 * the recipient before the socket died. Refunding on that outcome pays twice:
 * once to the recipient's mobile money, once back into the BiZik wallet.
 *
 * So every provider error carries a `delivery` verdict, and the payment service
 * refunds ONLY on `rejected`.
 */
export type ProviderDelivery =
  /** The provider received the request and refused it. Nothing happened. */
  | 'rejected'
  /** We never learned the outcome. It may or may not have been executed. */
  | 'unknown';

export class ProviderRequestError extends Error {
  readonly delivery: ProviderDelivery;
  readonly httpStatus?: number;

  constructor(message: string, delivery: ProviderDelivery, httpStatus?: number) {
    super(message);
    this.name = 'ProviderRequestError';
    this.delivery = delivery;
    this.httpStatus = httpStatus;
  }
}

/**
 * An HTTP response the provider actually sent us.
 *
 * 4xx is the provider talking: it read the request and refused it (bad number,
 * bad credentials, duplicate reference). Nothing was executed.
 *
 * 5xx is the provider failing mid-handling. Plenty of gateways return 500 or 504
 * after the downstream operator already accepted the instruction, so the outcome
 * is genuinely unknown. 408 and 429 are the same: the request may be queued.
 */
export function deliveryForHttpStatus(status: number): ProviderDelivery {
  if (status === 408 || status === 429) return 'unknown';
  if (status >= 400 && status < 500) return 'rejected';
  return 'unknown';
}

/**
 * A transport-level failure (no HTTP response at all). DNS failures and refused
 * connections mean the request never reached the provider; a timeout, a reset or
 * an aborted read mean it may have. When in doubt this returns 'unknown' - the
 * verdict that never spends money twice.
 */
export function deliveryForTransportError(error: unknown): ProviderDelivery {
  // undici surfaces the real syscall error on `cause`, not on the error itself.
  const cause = (error as { cause?: { code?: string } })?.cause;
  const rawCode = (error as { code?: string })?.code ?? cause?.code;
  // Nothing was sent: the name never resolved, or the port refused the socket
  // before any bytes went out.
  if (rawCode === 'ENOTFOUND' || rawCode === 'EAI_AGAIN' || rawCode === 'ECONNREFUSED') {
    return 'rejected';
  }
  return 'unknown';
}

/**
 * Wrap any thrown value as a ProviderRequestError. Adapters that classify their
 * own failures (Fapshi) pass straight through; the axios-based rails (MTN) throw
 * errors carrying `response.status` or a transport `code`, which are read here so
 * every provider gets a verdict without each adapter repeating this logic.
 *
 * The default is 'unknown' on purpose: an error shape we do not recognise must
 * never be treated as proof that nothing happened.
 */
export function asProviderRequestError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  const message = error instanceof Error ? error.message : String(error);

  const httpStatus = (error as { response?: { status?: number } })?.response?.status;
  if (typeof httpStatus === 'number') {
    return new ProviderRequestError(message, deliveryForHttpStatus(httpStatus), httpStatus);
  }

  // axios aborts a timed-out request with ECONNABORTED / ETIMEDOUT. The request
  // was already on the wire, so the outcome is unknowable from here.
  const code = (error as { code?: string })?.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return new ProviderRequestError(message, 'unknown');
  }

  return new ProviderRequestError(message, deliveryForTransportError(error));
}
