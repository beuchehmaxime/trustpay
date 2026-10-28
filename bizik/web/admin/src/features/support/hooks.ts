import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supportApi } from './support.api';
import type { HelpArticleInput, TicketFilters, TicketPriority, TicketStatus } from './types';

const SUPPORT_KEY = ['admin', 'support'] as const;

export function useTickets(filters: TicketFilters = {}) {
  return useQuery({
    queryKey: [...SUPPORT_KEY, 'tickets', filters],
    queryFn: () => supportApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useSupportStats() {
  return useQuery({
    queryKey: [...SUPPORT_KEY, 'stats'],
    queryFn: () => supportApi.stats(),
    staleTime: 30_000,
  });
}

/** Unresolved-ticket count for the sidebar badge - fetched silently. */
export function useSupportOpenCount(enabled: boolean) {
  return useQuery({
    queryKey: [...SUPPORT_KEY, 'open-count'],
    queryFn: () => supportApi.stats({ silent: true }),
    select: (stats) => stats.unresolved,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useTicket(id: string | null) {
  return useQuery({
    queryKey: [...SUPPORT_KEY, 'ticket', id],
    queryFn: () => supportApi.detail(id as string),
    enabled: !!id,
  });
}

export function useTicketActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: SUPPORT_KEY });
  const onDetail = (ticketId: string) => (data: unknown) => {
    queryClient.setQueryData([...SUPPORT_KEY, 'ticket', ticketId], data);
    invalidate();
  };
  return {
    reply: useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) => supportApi.reply(id, body),
      onSuccess: (data, variables) => onDetail(variables.id)(data),
    }),
    setStatus: useMutation({
      mutationFn: ({ id, status }: { id: string; status: TicketStatus }) =>
        supportApi.setStatus(id, status),
      onSuccess: (data, variables) => onDetail(variables.id)(data),
    }),
    setPriority: useMutation({
      mutationFn: ({ id, priority }: { id: string; priority: TicketPriority }) =>
        supportApi.setPriority(id, priority),
      onSuccess: (data, variables) => onDetail(variables.id)(data),
    }),
  };
}

// ---- Help center ----
export function useHelpArticles(enabled: boolean) {
  return useQuery({
    queryKey: [...SUPPORT_KEY, 'help'],
    queryFn: () => supportApi.articles(),
    enabled,
  });
}

export function useHelpActions() {
  const queryClient = useQueryClient();
  const setList = (data: unknown) =>
    queryClient.setQueryData([...SUPPORT_KEY, 'help'], data);
  return {
    create: useMutation({
      mutationFn: (input: HelpArticleInput) => supportApi.createArticle(input),
      onSuccess: setList,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: HelpArticleInput }) =>
        supportApi.updateArticle(id, input),
      onSuccess: setList,
    }),
    remove: useMutation({
      mutationFn: (id: string) => supportApi.deleteArticle(id),
      onSuccess: setList,
    }),
  };
}
