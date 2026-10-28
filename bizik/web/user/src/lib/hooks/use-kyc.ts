import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { kycApi } from '@/lib/api/kyc.api';

/** Live KYC / identity-verification status (SRS MOD-02). */
export function useKycStatus() {
  return useQuery({
    queryKey: ['kyc-status'],
    queryFn: kycApi.status,
    staleTime: 10_000,
  });
}

export function useSubmitKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kycApi.submit,
    onSuccess: (data) => {
      qc.setQueryData(['kyc-status'], data);
      qc.invalidateQueries({ queryKey: ['kyc-status'] });
    },
  });
}
