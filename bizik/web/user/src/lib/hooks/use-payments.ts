import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  paymentsApi,
  type CreatePaymentInput,
  type PaymentTransactionStatus,
  type PaymentTransactionView,
} from '@/lib/api/payments.api';

/**
 * Provider-agnostic deposit/withdraw hooks with an async-confirmation UX.
 *
 * A sync provider (bank / Payoneer / sandbox simulator) settles inside the create
 * call - the returned transaction is already SUCCESSFUL/FAILED. A real mobile-money
 * charge (MTN) comes back PROCESSING; the screen then polls
 * {@link usePaymentTransaction} until the customer approves on their phone.
 */

/** Terminal statuses stop polling; a PENDING/PROCESSING transaction keeps polling. */
const TERMINAL_STATUSES: readonly PaymentTransactionStatus[] = [
  'SUCCESSFUL',
  'FAILED',
  'REVERSED',
];

/** Poll cadence and ceiling: check every ~3s, give up after ~2 minutes. */
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;
const MAX_POLL_ATTEMPTS = Math.ceil(POLL_TIMEOUT_MS / POLL_INTERVAL_MS);

export function isTerminalPaymentStatus(status: PaymentTransactionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Refresh every wallet-derived view once real money has moved. */
function invalidateWalletQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['wallet'] });
  queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
}

export function useCreateDeposit() {
  return useMutation({
    mutationFn: (input: CreatePaymentInput) => paymentsApi.createDeposit(input),
  });
}

export function useCreateWithdrawal() {
  return useMutation({
    mutationFn: (input: CreatePaymentInput) => paymentsApi.createWithdrawal(input),
  });
}

/**
 * Poll a single payment transaction while it is PENDING/PROCESSING and stop the
 * moment it reaches a terminal status. When it settles SUCCESSFUL, the wallet
 * balance + ledger queries are invalidated so every screen reflects the change.
 *
 * Pass `enabled: false` (the default) until you actually have a PROCESSING
 * transaction to watch.
 */
export function usePaymentTransaction(
  transactionId: string | null,
  options: { enabled: boolean },
) {
  const queryClient = useQueryClient();
  const isEnabled = options.enabled && Boolean(transactionId);

  const query = useQuery<PaymentTransactionView>({
    queryKey: ['payment-transaction', transactionId],
    queryFn: () => paymentsApi.getTransaction(transactionId as string),
    enabled: isEnabled,
    // Cap total polling time by counting attempts against the timeout ceiling.
    retry: false,
    refetchInterval: (polledQuery) => {
      const current = polledQuery.state.data;
      if (current && isTerminalPaymentStatus(current.status)) return false;
      if (polledQuery.state.dataUpdateCount >= MAX_POLL_ATTEMPTS) return false;
      return POLL_INTERVAL_MS;
    },
  });

  const settledStatus = query.data?.status;

  // Refresh wallet-derived views once the transaction settles SUCCESSFUL.
  useEffect(() => {
    if (settledStatus === 'SUCCESSFUL') {
      invalidateWalletQueries(queryClient);
    }
  }, [settledStatus, queryClient]);

  return query;
}
