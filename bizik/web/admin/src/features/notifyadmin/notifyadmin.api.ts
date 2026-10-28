import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  AdminNotification,
  AdminNotifyFeed,
  AdminNotifyStats,
  AudienceCounts,
  BroadcastInput,
  BroadcastRow,
  ModerationItem,
  ModerationThread,
  NotificationTemplate,
  TemplateUpdateInput,
} from './types';

/** Admin operator notification / broadcast calls (SRS MOD-08). */
export const notifyAdminApi = {
  async list(params: { type?: string; unread?: boolean } = {}) {
    const query = Object.fromEntries(
      Object.entries({ type: params.type, unread: params.unread ? 'true' : undefined }).filter(
        ([, value]) => value !== undefined && value !== '',
      ),
    );
    const { data } = await api.get<AdminNotification[]>(endpoints.admin.adminNotifications, {
      params: query,
    });
    return data;
  },
  async feed(opts: { silent?: boolean } = {}) {
    const { data } = await api.get<AdminNotifyFeed>(endpoints.admin.adminNotifyFeed, {
      silent: opts.silent,
    });
    return data;
  },
  async unreadCount(opts: { silent?: boolean } = {}) {
    const { data } = await api.get<{ count: number }>(endpoints.admin.adminNotifyUnread, {
      silent: opts.silent,
    });
    return data.count;
  },
  async stats() {
    const { data } = await api.get<AdminNotifyStats>(endpoints.admin.adminNotifyStats);
    return data;
  },
  async markRead(id: string) {
    // `undefined`, NOT `null`. This endpoint takes no body, and the argument
    // only exists so the config below can be reached - but axios SERIALISES a
    // null into the body "null", which express.json() rejects in strict mode
    // (valid JSON must have an object or array at the top level). That turned
    // every single mark-as-read into a 500 while "mark all read", which passes
    // no body at all, kept working.
    const { data } = await api.post<{ success: boolean }>(
      endpoints.admin.adminNotifyRead(id),
      undefined,
      { silent: true },
    );
    return data;
  },
  async markAllRead() {
    const { data } = await api.post<{ success: boolean }>(endpoints.admin.adminNotifyReadAll);
    return data;
  },
  async broadcasts() {
    const { data } = await api.get<BroadcastRow[]>(endpoints.admin.adminBroadcasts);
    return data;
  },
  async sendBroadcast(input: BroadcastInput) {
    const { data } = await api.post<{ success: boolean; recipients: number }>(
      endpoints.admin.adminBroadcasts,
      input,
    );
    return data;
  },
  async audiences() {
    const { data } = await api.get<AudienceCounts>(endpoints.admin.adminBroadcastAudiences);
    return data;
  },
  // ---- Templates ----
  async templates() {
    const { data } = await api.get<NotificationTemplate[]>(endpoints.admin.adminNotifyTemplates);
    return data;
  },
  async updateTemplate(key: string, input: TemplateUpdateInput) {
    const { data } = await api.put<NotificationTemplate[]>(
      endpoints.admin.adminNotifyTemplate(key),
      input,
    );
    return data;
  },
  async testTemplate(key: string) {
    const { data } = await api.post<{ success: boolean; sentTo: string }>(
      endpoints.admin.adminNotifyTemplateTest(key),
    );
    return data;
  },
  // ---- Moderation ----
  async moderationQueue(status: 'PENDING' | 'RESOLVED' = 'PENDING') {
    const { data } = await api.get<ModerationItem[]>(endpoints.admin.adminModeration, {
      params: { status },
    });
    return data;
  },
  async moderationThread(id: string) {
    const { data } = await api.get<ModerationThread>(endpoints.admin.adminModerationThread(id));
    return data;
  },
  async moderationCount(opts: { silent?: boolean } = {}) {
    const { data } = await api.get<{ count: number }>(endpoints.admin.adminModerationCount, {
      silent: opts.silent,
    });
    return data.count;
  },
  async removeMessage(id: string) {
    const { data } = await api.post<{ success: boolean }>(endpoints.admin.adminModerationRemove(id));
    return data;
  },
  async dismissReport(id: string) {
    const { data } = await api.post<{ success: boolean }>(endpoints.admin.adminModerationDismiss(id));
    return data;
  },
};
