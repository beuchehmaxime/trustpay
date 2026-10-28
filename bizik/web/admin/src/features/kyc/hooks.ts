import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminKycApi } from './kyc.api';
import type { KycQueueFilters } from './types';

const KYC_KEY = ['admin', 'kyc'] as const;

export function useKycQueue(filters: KycQueueFilters = {}) {
  return useQuery({
    queryKey: [...KYC_KEY, 'queue', filters],
    queryFn: () => adminKycApi.queue(filters),
    placeholderData: (previous) => previous,
  });
}

/** Count of still-pending submissions for the sidebar badge - fetched silently. */
export function useKycPendingCount(enabled: boolean) {
  return useQuery({
    queryKey: [...KYC_KEY, 'pending-count'],
    queryFn: () => adminKycApi.queue({}, { silent: true }),
    select: (items) =>
      items.filter((item) => item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW').length,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useKycDetail(id: string) {
  return useQuery({
    queryKey: [...KYC_KEY, 'detail', id],
    queryFn: () => adminKycApi.detail(id),
    enabled: !!id,
  });
}

export function useApproveKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminKycApi.approve(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KYC_KEY }),
  });
}

export function useRejectKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminKycApi.reject(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KYC_KEY }),
  });
}

export function useRequestDocsKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminKycApi.requestDocs(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KYC_KEY }),
  });
}

export function useEscalateKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminKycApi.escalate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KYC_KEY }),
  });
}
