import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * Provider-agnostic payments service (SRS MOD-06 / payments module). Routes wallet
 * deposits & withdrawals to the real provider (MTN Mobile Money, Payoneer, bank,
 * or the sandbox simulator), resolving the concrete provider + phone number from
 * the saved `payoutMethodId` server-side.
 *
 * Unlike the legacy `/wallet/add-funds` (instant, simulated), these endpoints are
 * ASYNCHRONOUS: a mobile-money charge comes back `PROCESSING` and the customer
 * must approve on their phone, so callers POLL `getTransaction(id)` until the
 * transaction reaches a terminal status.
 *
 * Wire format is `{ success: true, data: <Txn> }`; every helper here returns the
 * unwrapped `data`.
 */

/** Lifecycle of a provider transaction. Only SUCCESSFUL/FAILED/REVERSED are terminal. */
export type PaymentTransactionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'REVERSED';

/** Whether the transaction moves money into (DEPOSIT) or out of (WITHDRAWAL) the wallet. */
export type PaymentOperation = 'DEPOSIT' | 'WITHDRAWAL';

/**
 * A single provider transaction as returned by the payments module. `reference`
 * is the provider-side reference; `failureReason` is populated on a FAILED status.
 */
export interface PaymentTransactionView {
  id: string;
  reference: string;
  operation: PaymentOperation;
  provider: string;
  amount: number;
  currency: string;
  status: PaymentTransactionStatus;
  failureReason?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

/** Create-deposit / create-withdrawal input. Send the user's HOME currency. */
export interface CreatePaymentInput {
  payoutMethodId: string;
  amount: number;
  currency?: string;
}

/** The `{ success, data }` envelope the payments endpoints wrap every payload in. */
interface PaymentEnvelope {
  success: boolean;
  data: PaymentTransactionView;
}

export const paymentsApi = {
  /** Start a deposit. Resolves SUCCESSFUL (sync provider) or PROCESSING (mobile money). */
  async createDeposit(input: CreatePaymentInput) {
    const { data } = await api.post<PaymentEnvelope>(endpoints.payments.deposits, input);
    return data.data;
  },
  /** Start a withdrawal (reserves funds, then disburses). Same async semantics. */
  async createWithdrawal(input: CreatePaymentInput) {
    const { data } = await api.post<PaymentEnvelope>(endpoints.payments.withdrawals, input);
    return data.data;
  },
  /** Poll a transaction to learn whether the customer approved it on their phone. */
  async getTransaction(transactionId: string) {
    const { data } = await api.get<PaymentEnvelope>(endpoints.payments.transaction(transactionId));
    return data.data;
  },
};
