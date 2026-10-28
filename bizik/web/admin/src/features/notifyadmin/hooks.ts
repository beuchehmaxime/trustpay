import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { normaliseError } from '@/lib/api/client';
import { notifyAdminApi } from './notifyadmin.api';
import type { BroadcastInput, TemplateUpdateInput } from './types';

const NOTIFY_KEY = ['admin', 'notifyadmin'] as const;

/** The top-bar bell feed - recent notifications + unread count, polled. */
export function useNotifyFeed(enabled = true) {
  return useQuery({
    queryKey: [...NOTIFY_KEY, 'feed'],
    queryFn: () => notifyAdminApi.feed({ silent: true }),
    enabled,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

/**
 * Unread-notification count for the sidebar badge. Shares the bell's feed query
 * (same key) so the badge, the bell and the inbox always agree.
 */
export function useNotifyUnread(enabled = true) {
  return useQuery({
    queryKey: [...NOTIFY_KEY, 'feed'],
    queryFn: () => notifyAdminApi.feed({ silent: true }),
    enabled,
    staleTime: 20_000,
    refetchInterval: 30_000,
    select: (data) => data.unread,
  });
}

/** Full inbox list, optionally filtered by type / unread-only. */
export function useNotifications(filters: { type?: string; unread?: boolean } = {}) {
  return useQuery({
    queryKey: [...NOTIFY_KEY, 'list', filters],
    queryFn: () => notifyAdminApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useNotifyStats() {
  return useQuery({
    queryKey: [...NOTIFY_KEY, 'stats'],
    queryFn: () => notifyAdminApi.stats(),
    staleTime: 20_000,
  });
}

/** Mark-read / mark-all-read, invalidating every notification query. */
export function useNotifyActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: NOTIFY_KEY });
  return {
    markRead: useMutation({
      mutationFn: (id: string) => notifyAdminApi.markRead(id),
      onSuccess: invalidate,
    }),
    markAllRead: useMutation({
      mutationFn: () => notifyAdminApi.markAllRead(),
      onSuccess: invalidate,
    }),
  };
}

export function useBroadcasts(enabled: boolean) {
  return useQuery({
    queryKey: [...NOTIFY_KEY, 'broadcasts'],
    queryFn: () => notifyAdminApi.broadcasts(),
    enabled,
  });
}

export function useSendBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BroadcastInput) => notifyAdminApi.sendBroadcast(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFY_KEY }),
  });
}

export function useAudienceCounts(enabled: boolean) {
  return useQuery({
    queryKey: [...NOTIFY_KEY, 'audiences'],
    queryFn: () => notifyAdminApi.audiences(),
    enabled,
    staleTime: 60_000,
  });
}

// ---- Templates ----
export function useTemplates(enabled: boolean) {
  return useQuery({
    queryKey: [...NOTIFY_KEY, 'templates'],
    queryFn: () => notifyAdminApi.templates(),
    enabled,
  });
}

export function useTemplateActions() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [...NOTIFY_KEY, 'templates'] });
  return {
    save: useMutation({
      mutationFn: ({ key, input }: { key: string; input: TemplateUpdateInput }) =>
        notifyAdminApi.updateTemplate(key, input),
      onSuccess: invalidate,
    }),
    test: useMutation({
      mutationFn: (key: string) => notifyAdminApi.testTemplate(key),
    }),
  };
}

// ---- Moderation ----
export function useModerationQueue(status: 'PENDING' | 'RESOLVED', enabled: boolean) {
  return useQuery({
    queryKey: [...NOTIFY_KEY, 'moderation', status],
    queryFn: () => notifyAdminApi.moderationQueue(status),
    enabled,
    placeholderData: (previous) => previous,
  });
}

/** The full conversation around a reported message (fetched when expanded). */
export function useModerationThread(id: string | null) {
  return useQuery({
    queryKey: [...NOTIFY_KEY, 'moderation-thread', id],
    queryFn: () => notifyAdminApi.moderationThread(id as string),
    enabled: !!id,
  });
}

/** Pending-report count for the sidebar badge - fetched silently. */
export function useModerationCount(enabled: boolean) {
  return useQuery({
    queryKey: [...NOTIFY_KEY, 'moderation-count'],
    queryFn: () => notifyAdminApi.moderationCount({ silent: true }),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useModerationActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...NOTIFY_KEY] });
  return {
    remove: useMutation({
      mutationFn: (id: string) => notifyAdminApi.removeMessage(id),
      onSuccess: () => {
        invalidate();
        toast.success('Message removed and the sender notified.');
      },
      onError: (error) => toast.error(normaliseError(error).message),
    }),
    dismiss: useMutation({
      mutationFn: (id: string) => notifyAdminApi.dismissReport(id),
      onSuccess: () => {
        invalidate();
        toast.success('Report dismissed.');
      },
      onError: (error) => toast.error(normaliseError(error).message),
    }),
  };
}
