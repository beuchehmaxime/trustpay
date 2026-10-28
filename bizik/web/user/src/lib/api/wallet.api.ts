import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * Wallet & Payouts service (SRS MOD-06) - the live source for the dashboard's
 * balance/escrow figures. Mirrors the mobile app's `WalletOverview` shape
 * (`application/mobile/src/features/wallet/wallet.api.ts`).
 */

export interface WalletSummary {
  availableUsd: number;
  inEscrowUsd: number;
  pendingPayoutUsd: number;
  portfolioUsd: number;
  /** Same totals expressed in the user's home currency (familiar units). */
  homeCurrency: string;
  availableHome: number;
  inEscrowHome: number;
  pendingPayoutHome: number;
  portfolioHome: number;
}

export interface WalletWallet {
  currency: string;
  label: string;
  balance: number;
  /** Emoji flag for the currency's region. */
  flag?: string;
  /** 24h change vs USD as a percentage (signed). */
  changePct?: number;
}

export interface WalletOverview {
  summary: WalletSummary;
  wallets?: WalletWallet[];
}

/**
 * A single ledger entry as shaped by the backend `wallet.service.transactions`
 * (mirrors the mobile `Transaction` type). `amount` is signed (negative = money
 * out); `type` is the reference kind (`topup`, `payout`, `fx`, `escrow_fund`,
 * `release`, `fee`, `refund`, …); `group` is the human date-bucket label.
 */
export interface WalletTransaction {
  id: string;
  reference?: string | null;
  title: string;
  subtitle: string;
  amount: number;
  currency: string;
  type: string;
  /** Live status for deposit/withdrawal rows: completed | pending | processing | failed. */
  status?: string;
  icon: string;
  date: string;
  group: string;
}

/** Live FX quote (mid-market + margin) for the convert screen. */
export interface FxQuote {
  from: string;
  to: string;
  midMarketRate: number;
  marginPct: number;
  appliedRate: number;
  toAmount: number;
  expiresInSeconds: number;
  /** 'live' when backed by the live market feed, 'configured' on fallback. */
  source: 'live' | 'configured';
  /** ISO-8601 timestamp of the last live refresh, or null on fallback. */
  asOf: string | null;
}

/** Result of a convert - a fresh overview plus the applied conversion figures. */
export type ConvertResult = WalletOverview & {
  converted?: { toAmount: number; appliedRate: number; midRate: number };
};

// ---- Payout methods --------------------------------------------------------

/** Concrete backend payout destination type (SRS MOD-06). */
export type PayoutMethodType = 'MTN_MOMO' | 'ORANGE_MONEY' | 'PAYONEER' | 'BANK';

/** Coarse category used to pick an icon/tile - derived by the backend. */
export type PayoutKind = 'momo' | 'bank' | 'payoneer';

/**
 * Client-facing payout method. Mirrors the backend `shapePayoutMethod` output
 * (`application/backend/src/wallet/wallet.service.ts`) and the mobile
 * `PayoutMethod` type. `detail` arrives already masked; `name` is the verified
 * account holder name.
 */
export interface PayoutMethod {
  id: string;
  kind: PayoutKind;
  type: PayoutMethodType;
  name: string;
  detail: string;
  icon: string;
  color: string;
  currency?: string | null;
  country?: string | null;
  verified: boolean;
  isDefault: boolean;
}

/** Add-payout input - mirrors the mobile `AddPayoutMethodInput`. */
export interface AddPayoutMethodInput {
  type: PayoutMethodType;
  /**
   * Verified account holder name. Optional for MoMo - the backend auto-fills it
   * from the user's verified identity; still sent for bank/Payoneer.
   */
  accountName?: string;
  accountDetail: string;
  provider?: string;
  currency?: string;
  country?: string;
  makeDefault?: boolean;
}

/**
 * Result of starting a payout-method verification. Non-MoMo destinations are
 * created straight away (`requiresOtp: false`); MoMo numbers must be SMS-OTP
 * verified first (`requiresOtp: true`, `phone` masked e.g. "+237•••386").
 */
export type StartPayoutVerificationResult =
  | { requiresOtp: false; method: PayoutMethod }
  | { requiresOtp: true; challengeId: string; phone: string; retryAfterSeconds?: number };

/** Confirm/resend payloads for the MoMo OTP challenge. */
export interface VerifyPayoutMethodOtpInput {
  challengeId: string;
  code: string;
}

/** Resend response - a fresh challenge bound to the same masked number. */
export interface ResendPayoutOtpResult {
  challengeId: string;
  phone: string;
  /** Seconds until another code may be requested. Drives the resend countdown. */
  retryAfterSeconds?: number;
}

export const walletApi = {
  async overview() {
    const { data } = await api.get<WalletOverview>(endpoints.wallet.overview);
    return data;
  },
  async transactions() {
    const { data } = await api.get<WalletTransaction[]>(endpoints.wallet.transactions);
    return data;
  },

  /**
   * Fetch a transaction's receipt as a real PDF Blob: first a short-lived signed
   * token, then the server-rendered PDF (auth'd by the token, not the session).
   */
  async receiptPdf(reference: string): Promise<{ blob: Blob; fileName: string }> {
    const { data: tokenData } = await api.get<{ token: string }>(
      endpoints.wallet.receiptToken(reference),
    );
    const { data: blob } = await api.get<Blob>(
      endpoints.wallet.receipt(reference, tokenData.token),
      { responseType: 'blob' },
    );
    return { blob, fileName: `bizik-receipt-${reference}.pdf` };
  },

  // ---- Money movement ----
  async addFunds(input: { amount: number; currency: string; payoutMethodId?: string }) {
    const { data } = await api.post<WalletOverview>(endpoints.wallet.addFunds, input);
    return data;
  },
  async payout(input: { amount: number; currency: string; payoutMethodId: string; express?: boolean }) {
    const { data } = await api.post<WalletOverview>(endpoints.wallet.payout, input);
    return data;
  },
  async convert(input: { fromCurrency: string; toCurrency: string; amount: number }) {
    const { data } = await api.post<ConvertResult>(endpoints.wallet.convert, input);
    return data;
  },
  async fxRate(from: string, to: string, amount?: number) {
    const { data } = await api.get<FxQuote>(endpoints.wallet.fxRate, { params: { from, to, amount } });
    return data;
  },

  // ---- Payout methods ----
  async listPayoutMethods() {
    const { data } = await api.get<PayoutMethod[]>(endpoints.wallet.payoutMethods);
    return data;
  },
  async addPayoutMethod(input: AddPayoutMethodInput) {
    const { data } = await api.post<PayoutMethod>(endpoints.wallet.payoutMethods, input);
    return data;
  },
  /**
   * Start verification for a new payout method. MoMo numbers get an SMS OTP
   * (`requiresOtp: true`); every other type is created immediately. Use this for
   * ALL types - the legacy `addPayoutMethod` now rejects MoMo destinations.
   */
  async startPayoutMethodVerification(input: AddPayoutMethodInput) {
    const { data } = await api.post<StartPayoutVerificationResult>(
      endpoints.wallet.payoutMethodVerifyStart,
      input,
    );
    return data;
  },
  /** Confirm a MoMo OTP challenge - returns the created, verified method. */
  async verifyPayoutMethodOtp(input: VerifyPayoutMethodOtpInput) {
    const { data } = await api.post<PayoutMethod>(endpoints.wallet.payoutMethodVerifyConfirm, input);
    return data;
  },
  /** Re-send the OTP for an in-flight challenge. */
  async resendPayoutMethodOtp(challengeId: string) {
    const { data } = await api.post<ResendPayoutOtpResult>(endpoints.wallet.payoutMethodVerifyResend, {
      challengeId,
    });
    return data;
  },
  async removePayoutMethod(id: string) {
    const { data } = await api.delete<PayoutMethod[]>(endpoints.wallet.payoutMethod(id));
    return data;
  },
  async setDefaultPayoutMethod(id: string) {
    const { data } = await api.post<PayoutMethod[]>(endpoints.wallet.payoutMethodDefault(id));
    return data;
  },
};
