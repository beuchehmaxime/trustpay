import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { disputesApi } from './disputes.api';
import type { DisputeFilters, RuleInput } from './types';

const DISPUTES_KEY = ['admin', 'disputes'] as const;

export function useDisputes(filters: DisputeFilters) {
  return useQuery({
    queryKey: [...DISPUTES_KEY, 'list', filters],
    queryFn: () => disputesApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useDisputeStats() {
  return useQuery({
    queryKey: [...DISPUTES_KEY, 'stats'],
    queryFn: () => disputesApi.stats(),
    staleTime: 30_000,
  });
}

/** Open-dispute count for the sidebar badge - fetched silently. */
export function useDisputeOpenCount(enabled: boolean) {
  return useQuery({
    queryKey: [...DISPUTES_KEY, 'open-count'],
    queryFn: () => disputesApi.stats({ silent: true }),
    select: (stats) => stats.open,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useDispute(id: string) {
  return useQuery({
    queryKey: [...DISPUTES_KEY, 'detail', id],
    queryFn: () => disputesApi.detail(id),
    enabled: !!id,
  });
}

export function useMediators(enabled: boolean) {
  return useQuery({
    queryKey: [...DISPUTES_KEY, 'mediators'],
    queryFn: disputesApi.mediators,
    enabled,
  });
}

/** Case actions; each invalidates the dispute queries. */
export function useDisputeActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: DISPUTES_KEY });
  return {
    assign: useMutation({
      mutationFn: ({ id, mediatorId }: { id: string; mediatorId: string }) =>
        disputesApi.assign(id, mediatorId),
      onSuccess: invalidate,
    }),
    escalate: useMutation({
      mutationFn: ({ id, note }: { id: string; note?: string }) => disputesApi.escalate(id, note),
      onSuccess: invalidate,
    }),
    message: useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) => disputesApi.message(id, body),
      onSuccess: invalidate,
    }),
    rule: useMutation({
      mutationFn: ({ id, input }: { id: string; input: RuleInput }) => disputesApi.rule(id, input),
      onSuccess: invalidate,
    }),
  };
}
