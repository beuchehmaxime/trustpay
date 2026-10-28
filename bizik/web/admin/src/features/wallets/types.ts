/** Wallets & payouts types - mirrors backend WalletAdminService (SRS MOD-08). */

export type WalletStatusValue = 'ACTIVE' | 'FROZEN' | 'CLOSED';
export type PayoutStatusValue =
  | 'INITIATED'
  | 'PROCESSING'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'FAILED';

export interface WalletUser {
  id: string;
  fullName: string;
  email: string | null;
  status: string | null;
}

/**
 * One row per HOLDER, not per wallet.
 *
 * Every user gets a wallet in each supported currency at signup, so listing
 * wallets repeated the same person six times. The row carries the wallet that
 * best represents them - the one holding the most money, or their first if
 * none holds any - and `walletCount` says how many they have in total.
 */
export interface WalletRow {
  id: string;
  userId: string;
  user: WalletUser;
  currency: string;
  balance: number;
  pendingBalance: number;
  status: WalletStatusValue;
  updatedAt: string;
  /** Total wallets this holder has under the current filter. */
  walletCount: number;
}

/** One of a holder's wallets, as listed by the switcher on the detail page. */
export interface HolderWallet {
  id: string;
  currency: string;
  balance: number;
  pendingBalance: number;
  status: WalletStatusValue;
}

export interface PayoutMethod {
  id: string;
  type: string;
  name: string;
  detail: string;
  currency: string | null;
  country: string | null;
  verified: boolean;
  isDefault: boolean;
}

export interface WalletTransaction {
  id: string;
  reference: string | null;
  type: string;
  amount: number;
  currency: string;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export interface PayoutRequest {
  id: string;
  reference: string;
  userId: string;
  user: WalletUser;
  amount: number;
  feeAmount: number;
  currency: string;
  status: PayoutStatusValue;
  isExpress: boolean;
  gateway: string | null;
  gatewayRef: string | null;
  failureReason: string | null;
  method: PayoutMethod | null;
  initiatedAt: string;
  completedAt: string | null;
}

export interface WalletDetail {
  id: string;
  userId: string;
  user: WalletUser;
  currency: string;
  balance: number;
  pendingBalance: number;
  status: WalletStatusValue;
  createdAt: string;
  updatedAt: string;
  /**
   * Every wallet this holder has, including the one being viewed. The list page
   * shows only one per person, so this is the only route to the others.
   */
  holderWallets: HolderWallet[];
  payoutMethods: PayoutMethod[];
  transactions: WalletTransaction[];
  payouts: PayoutRequest[];
}

/**
 * A large CEMAC (XAF) mobile-money withdrawal held for manual operator approval.
 * Mirrors the backend `GET /admin/withdrawal-holds` payload.
 */
export interface WithdrawalHold {
  id: string;
  reference: string;
  provider: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  createdAt: string;
  user: WalletUser;
}

export type WalletTxTypeValue =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'ESCROW_HOLD'
  | 'FEE'
  | 'REFUND'
  | 'FX_IN'
  | 'FX_OUT'
  | 'ADJUSTMENT';

/** A single row in the global wallet-transaction ledger. */
export interface WalletLedgerRow {
  id: string;
  reference: string | null;
  walletId: string;
  type: WalletTxTypeValue;
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
  userId: string;
  user: WalletUser;
}

export interface WalletLedgerDetail extends WalletLedgerRow {
  wallet: { id: string; currency: string; status: string } | null;
}

export interface WalletTxFilters {
  type?: WalletTxTypeValue;
  currency?: string;
  direction?: 'in' | 'out';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CurrencyBalance {
  currency: string;
  balance: number;
  pendingBalance: number;
  wallets: number;
}

export interface WalletStats {
  totalWallets: number;
  /** Distinct people holding them - the unit the wallets table is listed in. */
  totalHolders: number;
  byCurrency: CurrencyBalance[];
}

export interface PayoutStats {
  total: number;
  pending: number;
  onHold: number;
  completed: number;
  failed: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface WalletFilters {
  status?: WalletStatusValue;
  currency?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PayoutFilters {
  status?: PayoutStatusValue;
  currency?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Whether withdrawals can be paid automatically. Fapshi issues separate
 * services for collection and disbursement, so payouts stay manual until a
 * payout-enabled service is configured and activated.
 */
export interface PayoutRail {
  automatic: boolean;
  balance: number | null;
  currency: string | null;
  reason: string | null;
}
