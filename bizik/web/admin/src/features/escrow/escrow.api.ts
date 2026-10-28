import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  AccountFilters,
  EscrowAccountDetail,
  EscrowAccountRow,
  EscrowStats,
  EscrowTransactionDetail,
  LedgerFilters,
  LedgerTransaction,
  Paginated,
} from './types';

function clean<T extends object>(filters: T) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
  );
}

/** Admin escrow & transactions calls (SRS MOD-07). */
export const escrowApi = {
  async accounts(filters: AccountFilters = {}) {
    const { data } = await api.get<Paginated<EscrowAccountRow>>(endpoints.admin.escrowAccounts, {
      params: clean(filters),
    });
    return data;
  },
  async stats() {
    const { data } = await api.get<EscrowStats>(endpoints.admin.escrowStats);
    return data;
  },
  async ledger(filters: LedgerFilters = {}) {
    const { data } = await api.get<Paginated<LedgerTransaction>>(endpoints.admin.escrowLedger, {
      params: clean(filters),
    });
    return data;
  },
  async transaction(id: string) {
    const { data } = await api.get<EscrowTransactionDetail>(endpoints.admin.escrowTransaction(id));
    return data;
  },
  async account(id: string) {
    const { data } = await api.get<EscrowAccountDetail>(endpoints.admin.escrowAccount(id));
    return data;
  },
  async release(milestoneId: string) {
    const { data } = await api.post<EscrowAccountDetail>(
      endpoints.admin.escrowMilestoneRelease(milestoneId),
    );
    return data;
  },
  async refund(milestoneId: string, reason?: string) {
    const { data } = await api.post<EscrowAccountDetail>(
      endpoints.admin.escrowMilestoneRefund(milestoneId),
      { reason },
    );
    return data;
  },
  async adjust(id: string, delta: number, note: string) {
    const { data } = await api.post<EscrowAccountDetail>(endpoints.admin.escrowAccountAdjust(id), {
      delta,
      note,
    });
    return data;
  },
  async reconcile(id: string) {
    const { data } = await api.post<EscrowAccountDetail>(endpoints.admin.escrowAccountReconcile(id));
    return data;
  },
};
