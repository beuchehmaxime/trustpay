import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { walletApi, type WalletOverview } from '@/lib/api/wallet.api';

/**
 * Live wallet overview. Exposes the home-currency + USD balance/escrow figures
 * the dashboard hero and KPI row read (previously from `demo/dashboard.persona`).
 */
export function useWallet() {
  const query = useQuery({
    queryKey: ['wallet', 'overview'],
    queryFn: walletApi.overview,
  });
  const summary = query.data?.summary;
  return {
    overview: query.data,
    homeCurrency: summary?.homeCurrency ?? 'USD',
    walletBalance: summary?.availableHome ?? 0,
    walletBalanceUsd: summary?.availableUsd ?? 0,
    inEscrow: summary?.inEscrowHome ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Live transaction ledger (SRS MOD-06). Replaces the `demo/transactions` data. */
export function useWalletTransactions() {
  return useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: walletApi.transactions,
  });
}

/**
 * Seed the overview cache with the fresh `WalletOverview` a money-movement
 * mutation returns, then invalidate the wallet + ledger queries so every screen
 * (balances, holdings, transactions) reflects the change.
 */
function onWalletChanged(qc: ReturnType<typeof useQueryClient>, overview: WalletOverview) {
  qc.setQueryData(['wallet', 'overview'], overview);
  qc.invalidateQueries({ queryKey: ['wallet'] });
  qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
}

export function useAddFunds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: number; currency: string; payoutMethodId?: string }) =>
      walletApi.addFunds(input),
    onSuccess: (overview) => onWalletChanged(qc, overview),
  });
}

export function usePayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: number; currency: string; payoutMethodId: string; express?: boolean }) =>
      walletApi.payout(input),
    onSuccess: (overview) => onWalletChanged(qc, overview),
  });
}

export function useConvert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { fromCurrency: string; toCurrency: string; amount: number }) =>
      walletApi.convert(input),
    onSuccess: (result) => onWalletChanged(qc, result),
  });
}

/** Live FX quote (mid-market − margin) for the convert screen; polls while open. */
export function useFxRate(from: string, to: string, amount?: number) {
  return useQuery({
    queryKey: ['fx-rate', from, to, amount],
    queryFn: () => walletApi.fxRate(from, to, amount),
    enabled: from !== to,
    staleTime: 25_000,
    refetchInterval: 30_000,
  });
}
