import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  Paginated,
  PayoutFilters,
  PayoutRequest,
  PayoutStats,
  WalletDetail,
  WalletFilters,
  WalletLedgerDetail,
  WalletLedgerRow,
  WalletRow,
  WalletStats,
  WalletTxFilters,
  PayoutRail,
  WithdrawalHold,
} from './types';

function clean<T extends object>(filters: T) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
  );
}

/** Admin wallets & payouts calls (SRS MOD-08). */
export const walletsApi = {
  async wallets(filters: WalletFilters = {}) {
    const { data } = await api.get<Paginated<WalletRow>>(endpoints.admin.wallets, {
      params: clean(filters),
    });
    return data;
  },
  async walletStats() {
    const { data } = await api.get<WalletStats>(endpoints.admin.walletStats);
    return data;
  },
  async wallet(id: string) {
    const { data } = await api.get<WalletDetail>(endpoints.admin.wallet(id));
    return data;
  },
  async transactions(filters: WalletTxFilters = {}) {
    const { data } = await api.get<Paginated<WalletLedgerRow>>(endpoints.admin.walletTransactions, {
      params: clean(filters),
    });
    return data;
  },
  async transaction(id: string) {
    const { data } = await api.get<WalletLedgerDetail>(endpoints.admin.walletTransaction(id));
    return data;
  },
  async payouts(filters: PayoutFilters = {}, opts: { silent?: boolean } = {}) {
    const { data } = await api.get<Paginated<PayoutRequest>>(endpoints.admin.payouts, {
      params: clean(filters),
      silent: opts.silent,
    });
    return data;
  },
  async payoutStats(opts: { silent?: boolean } = {}) {
    const { data } = await api.get<PayoutStats>(endpoints.admin.payoutStats, {
      silent: opts.silent,
    });
    return data;
  },
  async approve(id: string) {
    const { data } = await api.post<PayoutRequest>(endpoints.admin.payoutApprove(id));
    return data;
  },
  async hold(id: string) {
    const { data } = await api.post<PayoutRequest>(endpoints.admin.payoutHold(id));
    return data;
  },
  async retry(id: string) {
    const { data } = await api.post<PayoutRequest>(endpoints.admin.payoutRetry(id));
    return data;
  },
  async reject(id: string, reason: string) {
    const { data } = await api.post<PayoutRequest>(endpoints.admin.payoutReject(id), { reason });
    return data;
  },
  async withdrawalHolds(opts: { silent?: boolean } = {}) {
    const { data } = await api.get<WithdrawalHold[]>(endpoints.admin.withdrawalHolds, {
      silent: opts.silent,
    });
    return data;
  },
  async approveWithdrawalHold(id: string) {
    const { data } = await api.post<PayoutRequest>(endpoints.admin.withdrawalHoldApprove(id));
    return data;
  },
  /** Record a withdrawal paid outside the platform (no automatic rail). */
  async markWithdrawalPaid(id: string, reference: string) {
    const { data } = await api.post<PayoutRequest>(endpoints.admin.withdrawalHoldMarkPaid(id), {
      reference,
    });
    return data;
  },

  /** Is there an automatic payout rail, and what is its balance? */
  async payoutRail() {
    const { data } = await api.get<PayoutRail>(endpoints.admin.payoutRail);
    return data;
  },

  async rejectWithdrawalHold(id: string, reason: string) {
    const { data } = await api.post<PayoutRequest>(endpoints.admin.withdrawalHoldReject(id), {
      reason,
    });
    return data;
  },
};
