import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { escrowApi } from './escrow.api';
import type { AccountFilters, LedgerFilters } from './types';

const ESCROW_KEY = ['admin', 'escrow'] as const;

export function useEscrowAccounts(filters: AccountFilters) {
  return useQuery({
    queryKey: [...ESCROW_KEY, 'accounts', filters],
    queryFn: () => escrowApi.accounts(filters),
    placeholderData: (previous) => previous,
  });
}

export function useEscrowStats() {
  return useQuery({ queryKey: [...ESCROW_KEY, 'stats'], queryFn: escrowApi.stats, staleTime: 30_000 });
}

export function useEscrowLedger(filters: LedgerFilters, enabled: boolean) {
  return useQuery({
    queryKey: [...ESCROW_KEY, 'ledger', filters],
    queryFn: () => escrowApi.ledger(filters),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useEscrowTransaction(id: string | null) {
  return useQuery({
    queryKey: [...ESCROW_KEY, 'transaction', id],
    queryFn: () => escrowApi.transaction(id as string),
    enabled: !!id,
  });
}

export function useEscrowAccount(id: string) {
  return useQuery({
    queryKey: [...ESCROW_KEY, 'account', id],
    queryFn: () => escrowApi.account(id),
    enabled: !!id,
  });
}

/** Manual escrow actions; each invalidates the escrow queries. */
export function useEscrowActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ESCROW_KEY });
  return {
    release: useMutation({
      mutationFn: (milestoneId: string) => escrowApi.release(milestoneId),
      onSuccess: invalidate,
    }),
    refund: useMutation({
      mutationFn: ({ milestoneId, reason }: { milestoneId: string; reason?: string }) =>
        escrowApi.refund(milestoneId, reason),
      onSuccess: invalidate,
    }),
    adjust: useMutation({
      mutationFn: ({ id, delta, note }: { id: string; delta: number; note: string }) =>
        escrowApi.adjust(id, delta, note),
      onSuccess: invalidate,
    }),
    reconcile: useMutation({
      mutationFn: (id: string) => escrowApi.reconcile(id),
      onSuccess: invalidate,
    }),
  };
}
