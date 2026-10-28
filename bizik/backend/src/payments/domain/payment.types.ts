/**
 * BiZik payment DOMAIN - provider-agnostic vocabulary.
 *
 * Nothing here mentions MTN / Orange / a specific bank. The wallet, ledger and
 * business logic speak only these terms; each provider adapter (infrastructure)
 * translates them to/from its own API. This is the seam that lets us add Orange
 * Money or a bank later without touching wallet/ledger code.
 */

/** Which pay-in / pay-out rail a transaction runs over. Mirrors the Prisma enum. */
export type PaymentProviderName = 'MTN_MOBILE_MONEY' | 'ORANGE_MONEY' | 'BANK';

/** Direction of money relative to the user's BiZik wallet. */
export type PaymentOperation = 'DEPOSIT' | 'WITHDRAWAL';

/**
 * Lifecycle of a provider transaction. `PROCESSING` is the critical state:
 * the provider ACCEPTED the request but has NOT confirmed the money moved -
 * the wallet must never be credited/finalised on `PROCESSING`.
 */
export type PaymentTransactionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'REVERSED';

/** A collection = pulling money IN from a customer (deposit). */
export interface CollectionRequest {
  /** BiZik-side idempotent reference (e.g. DEP-<uuid>). */
  transactionReference: string;
  /** Minor-unit-free decimal string as providers expect, e.g. "25000". */
  amount: string;
  currency: string;
  customerPhoneNumber: string;
  description: string;
}

export interface CollectionResponse {
  /** Provider-side correlation id we poll / match webhooks against. */
  providerReference: string;
  status: PaymentTransactionStatus;
}

/** A disbursement = pushing money OUT to a recipient (withdrawal). */
export interface DisbursementRequest {
  transactionReference: string;
  amount: string;
  currency: string;
  recipientPhoneNumber: string;
  description: string;
  /**
   * Which rail the user chose. Passed through so an aggregator is told the
   * medium explicitly instead of guessing it from the number prefix.
   */
  provider?: PaymentProviderName;
}

export interface DisbursementResponse {
  providerReference: string;
  status: PaymentTransactionStatus;
}

/** The normalised status a provider reports for one transaction. */
export interface ProviderTransactionStatus {
  providerReference: string;
  status: PaymentTransactionStatus;
  providerTransactionId?: string;
  failureReason?: string;
  /**
   * What the provider says was actually collected/paid, and which of our
   * references it belongs to. Settlement compares these with the stored row:
   * without that check a partial payment (or any provider-side discrepancy)
   * credits the full requested amount.
   */
  amount?: number;
  /**
   * What the provider KEPT on this movement, when it reports it. Fapshi does,
   * as the gap between what it collected and what it credited us. Recorded
   * beside our estimate so a wrong configured rate shows up as a variance
   * rather than as an unexplained shortfall months later.
   */
  providerFee?: number;
  transactionReference?: string;
}

/** A normalised inbound webhook event, after each adapter parses its own payload. */
export interface NormalisedWebhookEvent {
  provider: PaymentProviderName;
  /** Provider reference that ties the event back to our PaymentTransaction. */
  providerReference?: string;
  /** Our own reference (providers echo it back), a fallback correlation key. */
  transactionReference?: string;
  status: PaymentTransactionStatus;
  providerTransactionId?: string;
  failureReason?: string;
  /** Stable event id used to de-duplicate replays. */
  externalId: string;
  eventType: string;
}
