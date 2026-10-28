import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  walletApi,
  type AddPayoutMethodInput,
  type VerifyPayoutMethodOtpInput,
} from '@/lib/api/wallet.api';

/** Live payout-method list (SRS MOD-06). Replaces the `settingsPayoutMethods` demo. */
export function usePayoutMethods() {
  return useQuery({
    queryKey: ['payout-methods'],
    queryFn: walletApi.listPayoutMethods,
  });
}

/** Invalidate both the payout-method list and the wallet overview (balances). */
function invalidatePayouts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['payout-methods'] });
  qc.invalidateQueries({ queryKey: ['wallet'] });
}

export function useAddPayoutMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddPayoutMethodInput) => walletApi.addPayoutMethod(input),
    onSuccess: () => invalidatePayouts(qc),
  });
}

/**
 * Start verifying a new payout method. MoMo destinations return an OTP
 * challenge; other types are created here (invalidate on that outcome).
 */
export function useStartPayoutMethodVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddPayoutMethodInput) => walletApi.startPayoutMethodVerification(input),
    onSuccess: (result) => {
      if (result.requiresOtp === false) invalidatePayouts(queryClient);
    },
  });
}

/** Confirm the MoMo OTP challenge - creates the verified method on success. */
export function useVerifyPayoutMethodOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VerifyPayoutMethodOtpInput) => walletApi.verifyPayoutMethodOtp(input),
    onSuccess: () => invalidatePayouts(queryClient),
  });
}

/** Resend the OTP for an in-flight challenge. */
export function useResendPayoutMethodOtp() {
  return useMutation({
    mutationFn: (challengeId: string) => walletApi.resendPayoutMethodOtp(challengeId),
  });
}

export function useRemovePayoutMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => walletApi.removePayoutMethod(id),
    onSuccess: (list) => {
      qc.setQueryData(['payout-methods'], list);
      invalidatePayouts(qc);
    },
  });
}

export function useSetDefaultPayoutMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => walletApi.setDefaultPayoutMethod(id),
    onSuccess: (list) => {
      qc.setQueryData(['payout-methods'], list);
      invalidatePayouts(qc);
    },
  });
}
