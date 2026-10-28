import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { amlApi } from './aml.api';
import type { AmlFilters } from './types';

const AML_KEY = ['admin', 'aml'] as const;

export function useAmlAlerts(filters: AmlFilters = {}) {
  return useQuery({
    queryKey: [...AML_KEY, 'alerts', filters],
    queryFn: () => amlApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useAmlStats() {
  return useQuery({ queryKey: [...AML_KEY, 'stats'], queryFn: () => amlApi.stats(), staleTime: 30_000 });
}

/** Open-alert count for the sidebar badge - fetched silently. */
export function useAmlOpenCount(enabled: boolean) {
  return useQuery({
    queryKey: [...AML_KEY, 'open-count'],
    queryFn: () => amlApi.stats({ silent: true }),
    select: (stats) => stats.open,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useAmlAlert(id: string) {
  return useQuery({
    queryKey: [...AML_KEY, 'detail', id],
    queryFn: () => amlApi.detail(id),
    enabled: !!id,
  });
}

export function useAmlTimeline(id: string) {
  return useQuery({
    queryKey: [...AML_KEY, 'timeline', id],
    queryFn: () => amlApi.timeline(id),
    enabled: !!id,
  });
}

export function useAddAmlNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => amlApi.addNote(id, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...AML_KEY, 'timeline', id] }),
  });
}

/** Case actions keyed off the alert id; each invalidates the AML queries. */
export function useAmlActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: AML_KEY });
  return {
    review: useMutation({ mutationFn: (id: string) => amlApi.review(id), onSuccess: invalidate }),
    clear: useMutation({
      mutationFn: ({ id, note }: { id: string; note?: string }) => amlApi.clear(id, note),
      onSuccess: invalidate,
    }),
    escalate: useMutation({
      mutationFn: ({ id, note }: { id: string; note?: string }) => amlApi.escalate(id, note),
      onSuccess: invalidate,
    }),
    fileSar: useMutation({
      mutationFn: ({ id, narrative }: { id: string; narrative: string }) =>
        amlApi.fileSar(id, narrative),
      onSuccess: invalidate,
    }),
    freeze: useMutation({ mutationFn: (id: string) => amlApi.freeze(id), onSuccess: invalidate }),
  };
}
