import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { feesApi } from './fees.api';
import type { FeeUpdateInput } from './types';

const FEES_KEY = ['admin', 'fees'] as const;

export function useFeesConfig() {
  return useQuery({ queryKey: [...FEES_KEY, 'config'], queryFn: feesApi.config });
}

export function useUpdateFees() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FeeUpdateInput) => feesApi.updateFees(input),
    onSuccess: (data) => queryClient.setQueryData([...FEES_KEY, 'config'], data),
  });
}

export function useUpdateFxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ currency, usdRate }: { currency: string; usdRate: number }) =>
      feesApi.updateFxRate(currency, usdRate),
    onSuccess: (data) => queryClient.setQueryData([...FEES_KEY, 'config'], data),
  });
}
