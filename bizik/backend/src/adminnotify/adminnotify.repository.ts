import { AdminEventType, NotificationChannel, NotificationCategory, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

/**
 * Data access for operator notifications (the admin console inbox / bell) and
 * for fanning out user-facing broadcasts.
 */
export const AdminNotifyRepository = {
  /**
   * Prisma filter that scopes notifications to what an operator may see: a super
   * admin sees all; everyone else sees permission-less notices plus those gated
   * on a permission they hold.
   */
  visibilityWhere(scope: { isSuperAdmin: boolean; permissions: string[] }): Prisma.AdminNotificationWhereInput {
    if (scope.isSuperAdmin) return {};
    return { OR: [{ permission: null }, { permission: { in: scope.permissions } }] };
  },

  list(where: Prisma.AdminNotificationWhereInput, take = 100) {
    return prisma.adminNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });
  },

  count(where: Prisma.AdminNotificationWhereInput) {
    return prisma.adminNotification.count({ where });
  },

  /** Read receipts this operator has for the given notification ids. */
  readsFor(operatorId: string, notificationIds: string[]) {
    return prisma.adminNotificationRead.findMany({
      where: { operatorId, notificationId: { in: notificationIds } },
      select: { notificationId: true },
    });
  },

  markRead(operatorId: string, notificationId: string) {
    return prisma.adminNotificationRead.upsert({
      where: { notificationId_operatorId: { notificationId, operatorId } },
      update: {},
      create: { notificationId, operatorId },
    });
  },

  markManyRead(operatorId: string, notificationIds: string[]) {
    return prisma.adminNotificationRead.createMany({
      data: notificationIds.map((notificationId) => ({ notificationId, operatorId })),
      skipDuplicates: true,
    });
  },

  getById(id: string) {
    return prisma.adminNotification.findUnique({ where: { id } });
  },

  typeCounts(where: Prisma.AdminNotificationWhereInput) {
    return prisma.adminNotification.groupBy({
      by: ['type'],
      where,
      _count: { _all: true },
    });
  },

  /** Fan out a user-facing broadcast to every recipient in one insert. */
  createUserNotifications(
    recipients: string[],
    data: {
      category: NotificationCategory;
      title: string;
      body: string;
      channels: NotificationChannel[];
    },
  ) {
    return prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        category: data.category,
        title: data.title,
        body: data.body,
        channels: data.channels,
        entityType: 'broadcast',
        isCritical: false,
      })),
    });
  },

  /** Prisma filter for a broadcast audience segment. */
  audienceWhere(audience: 'ALL' | 'FREELANCERS' | 'CLIENTS'): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = { status: { in: ['ACTIVE', 'PENDING'] } };
    if (audience === 'FREELANCERS') where.freelancerEnabled = true;
    if (audience === 'CLIENTS') where.freelancerEnabled = false;
    return where;
  },

  /** Ids of users matching a broadcast audience. */
  async audienceUserIds(audience: 'ALL' | 'FREELANCERS' | 'CLIENTS'): Promise<string[]> {
    const users = await prisma.user.findMany({
      where: this.audienceWhere(audience),
      select: { id: true },
    });
    return users.map((user) => user.id);
  },

  audienceCount(audience: 'ALL' | 'FREELANCERS' | 'CLIENTS') {
    return prisma.user.count({ where: this.audienceWhere(audience) });
  },

  // ---- Notification templates (notifications.manage) ----
  listTemplates() {
    return prisma.notificationTemplate.findMany({ orderBy: { createdAt: 'asc' } });
  },

  getTemplate(key: string) {
    return prisma.notificationTemplate.findUnique({ where: { key } });
  },

  updateTemplate(
    key: string,
    data: { subject: string; body: string; channels: NotificationChannel[]; updatedById: string },
  ) {
    return prisma.notificationTemplate.update({ where: { key }, data });
  },

  // ---- Message moderation (messages.moderate) ----
  reportsByStatus(statuses: ('PENDING' | 'REMOVED' | 'DISMISSED')[]) {
    return prisma.messageReport.findMany({
      where: { status: { in: statuses } },
      // Pending first (needs action), then most recent.
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { message: true },
      take: 200,
    });
  },

  pendingReportCount() {
    return prisma.messageReport.count({ where: { status: 'PENDING' } });
  },

  getReport(id: string) {
    return prisma.messageReport.findUnique({ where: { id }, include: { message: true } });
  },

  /** All messages in a thread (moderation context around the reported one). */
  threadMessages(threadId: string) {
    return prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        senderId: true,
        recipientId: true,
        body: true,
        removedAt: true,
        createdAt: true,
      },
      take: 200,
    });
  },

  async threadContractIds(threadIds: string[]) {
    const threads = await prisma.messageThread.findMany({
      where: { id: { in: threadIds } },
      select: { id: true, contractId: true },
    });
    return threads;
  },

  contractsByIds(ids: string[]) {
    return prisma.contract.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true },
    });
  },

  removeMessage(messageId: string) {
    return prisma.message.update({
      where: { id: messageId },
      data: { removedAt: new Date(), body: '[Message removed by moderator]' },
    });
  },

  resolveReport(id: string, status: 'REMOVED' | 'DISMISSED', resolvedById: string) {
    return prisma.messageReport.update({
      where: { id },
      data: { status, resolvedById, resolvedAt: new Date() },
    });
  },

  /** Recent broadcasts, reconstructed from the audit trail. */
  recentBroadcasts(take = 20) {
    return prisma.auditLog.findMany({
      where: { action: 'broadcast.send' },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },

  actorNames(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, email: true },
    });
  },
};

export type AdminNotifyTypeFilter = AdminEventType | undefined;
