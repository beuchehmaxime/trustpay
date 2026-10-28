import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notificationsApi } from '@/lib/api/notifications.api';

const LIST_KEY = ['notifications', 'list'] as const;
const UNREAD_KEY = ['notifications', 'unread'] as const;

/** The full notification feed (Activity page). */
export function useNotifications() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: notificationsApi.list,
  });
}

/** Unread total that drives the top-bar bell badge; polled every 30s. */
export function useUnreadCount() {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 30_000,
  });
}

/** Mark a single notification read, then refresh the list + badge. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });
}

/** Mark everything read, then refresh the list + badge. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });
}
