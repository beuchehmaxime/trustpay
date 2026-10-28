import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * Notifications service (SRS MOD-08) - the single stream behind the top-bar bell
 * and the Activity page. Mirrors the mobile app's `AppNotification` shape
 * (`application/mobile/src/features/notifications/notifications.api.ts`). The
 * backend returns already-rendered `title`/`body` strings, so the UI renders
 * them directly and only maps `category` onto an icon/tone.
 */

export type NotificationCategory =
  | 'PAYMENT'
  | 'CONTRACT'
  | 'KYC'
  | 'DISPUTE'
  | 'SECURITY'
  | 'SYSTEM';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  isCritical: boolean;
  read: boolean;
  /** Deep-link target, e.g. entityType 'contract' + the contract id. */
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export const notificationsApi = {
  async list() {
    const { data } = await api.get<AppNotification[]>(endpoints.notifications.list);
    return data;
  },
  async unreadCount() {
    const { data } = await api.get<{ count: number }>(endpoints.notifications.unreadCount);
    return data.count;
  },
  async markRead(id: string) {
    const { data } = await api.post<{ success: boolean }>(endpoints.notifications.read(id));
    return data;
  },
  async markAllRead() {
    const { data } = await api.post<{ success: boolean }>(endpoints.notifications.readAll);
    return data;
  },
};
