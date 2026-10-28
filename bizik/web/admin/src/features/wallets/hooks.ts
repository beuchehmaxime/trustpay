import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { walletsApi } from './wallets.api';
import type { PayoutFilters, WalletFilters, WalletTxFilters } from './types';

const WALLETS_KEY = ['admin', 'wallets'] as const;

export function useWallets(filters: WalletFilters) {
  return useQuery({
    queryKey: [...WALLETS_KEY, 'list', filters],
    queryFn: () => walletsApi.wallets(filters),
    placeholderData: (previous) => previous,
  });
}

export function useWalletStats() {
  return useQuery({
    queryKey: [...WALLETS_KEY, 'stats'],
    queryFn: walletsApi.walletStats,
    staleTime: 30_000,
  });
}

export function useWallet(id: string) {
  return useQuery({
    queryKey: [...WALLETS_KEY, 'detail', id],
    queryFn: () => walletsApi.wallet(id),
    enabled: !!id,
  });
}

export function useWalletTransactions(filters: WalletTxFilters, enabled: boolean) {
  return useQuery({
    queryKey: [...WALLETS_KEY, 'transactions', filters],
    queryFn: () => walletsApi.transactions(filters),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useWalletTransaction(id: string | null) {
  return useQuery({
    queryKey: [...WALLETS_KEY, 'transaction', id],
    queryFn: () => walletsApi.transaction(id as string),
    enabled: !!id,
  });
}

export function usePayouts(filters: PayoutFilters, enabled: boolean) {
  return useQuery({
    queryKey: [...WALLETS_KEY, 'payouts', filters],
    queryFn: () => walletsApi.payouts(filters),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function usePayoutStats() {
  return useQuery({
    queryKey: [...WALLETS_KEY, 'payout-stats'],
    queryFn: () => walletsApi.payoutStats(),
    staleTime: 30_000,
  });
}

/** Open-payout count for the sidebar badge - fetched silently. */
export function usePayoutQueueCount(enabled: boolean) {
  return useQuery({
    queryKey: [...WALLETS_KEY, 'queue-count'],
    queryFn: () => walletsApi.payoutStats({ silent: true }),
    select: (stats) => stats.pending + stats.onHold,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Held large-XAF withdrawals awaiting manual approval. */
export function useWithdrawalHolds(enabled: boolean) {
  return useQuery({
    queryKey: [...WALLETS_KEY, 'withdrawal-holds'],
    queryFn: () => walletsApi.withdrawalHolds(),
    placeholderData: (previous) => previous,
    enabled,
  });
}

/** Held-withdrawal count for the sidebar badge - fetched silently. */
export function useWithdrawalHoldCount(enabled: boolean) {
  return useQuery({
    queryKey: [...WALLETS_KEY, 'withdrawal-hold-count'],
    queryFn: () => walletsApi.withdrawalHolds({ silent: true }),
    select: (holds) => holds.length,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Approve / reject actions for held withdrawals; each invalidates the wallet queries. */
export function useWithdrawalHoldActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: WALLETS_KEY });
  return {
    approve: useMutation({
      mutationFn: (id: string) => walletsApi.approveWithdrawalHold(id),
      onSuccess: invalidate,
    }),
    markPaid: useMutation({
      mutationFn: ({ id, reference }: { id: string; reference: string }) =>
        walletsApi.markWithdrawalPaid(id, reference),
      onSuccess: invalidate,
    }),
    reject: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        walletsApi.rejectWithdrawalHold(id, reason),
      onSuccess: invalidate,
    }),
  };
}

/** Whether payouts can be sent automatically, and the rail's balance. */
export function usePayoutRail(enabled: boolean) {
  return useQuery({
    queryKey: [...WALLETS_KEY, 'payout-rail'],
    queryFn: () => walletsApi.payoutRail(),
    enabled,
    staleTime: 60_000,
  });
}

/** Payout queue actions; each invalidates the wallet/payout queries. */
export function usePayoutActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: WALLETS_KEY });
  return {
    approve: useMutation({ mutationFn: (id: string) => walletsApi.approve(id), onSuccess: invalidate }),
    hold: useMutation({ mutationFn: (id: string) => walletsApi.hold(id), onSuccess: invalidate }),
    retry: useMutation({ mutationFn: (id: string) => walletsApi.retry(id), onSuccess: invalidate }),
    reject: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) => walletsApi.reject(id, reason),
      onSuccess: invalidate,
    }),
  };
}
