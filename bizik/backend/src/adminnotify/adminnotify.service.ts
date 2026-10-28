import { AdminEventType, AdminNotification, NotificationChannel } from '@prisma/client';

import { AppError } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { emitAdminEvent } from '../lib/admin-events';
import { sendEmail } from '../lib/notify';
import { prisma } from '../lib/prisma';
import { AdminNotifyRepository } from './adminnotify.repository';
import { BroadcastInput, UpdateTemplateInput } from './adminnotify.validation';

interface OperatorScope {
  isSuperAdmin: boolean;
  permissions: string[];
}

/** Load an operator's RBAC scope so notification visibility can be enforced. */
async function scopeFor(operatorId: string): Promise<OperatorScope> {
  const operator = await prisma.user.findUnique({
    where: { id: operatorId },
    include: { adminRole: true },
  });
  if (!operator?.adminRole) {
    throw new AppError(403, 'Q-403', 'You do not have access to the admin console.');
  }
  return {
    isSuperAdmin: operator.adminRole.isSuperAdmin,
    permissions: operator.adminRole.permissions,
  };
}

const AUDIENCE_LABEL: Record<BroadcastInput['audience'], string> = {
  ALL: 'all users',
  FREELANCERS: 'freelancers',
  CLIENTS: 'clients',
};

function toDto(notification: AdminNotification, read: boolean) {
  return {
    id: notification.id,
    type: notification.type,
    severity: notification.severity,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    entityType: notification.entityType,
    entityId: notification.entityId,
    read,
    createdAt: notification.createdAt.toISOString(),
  };
}

export const AdminNotifyService = {
  /**
   * The operator's inbox, scoped by RBAC and (optionally) by type / unread-only,
   * with each row's read flag merged in.
   */
  async list(operatorId: string, filters: { type?: AdminEventType; unreadOnly?: boolean } = {}) {
    const scope = await scopeFor(operatorId);
    const where = {
      ...AdminNotifyRepository.visibilityWhere(scope),
      ...(filters.type ? { type: filters.type } : {}),
    };
    const rows = await AdminNotifyRepository.list(where, 100);
    const reads = await AdminNotifyRepository.readsFor(
      operatorId,
      rows.map((row) => row.id),
    );
    const readSet = new Set(reads.map((read) => read.notificationId));
    const items = rows.map((row) => toDto(row, readSet.has(row.id)));
    return filters.unreadOnly ? items.filter((item) => !item.read) : items;
  },

  /** Compact recent feed for the top-bar bell dropdown. */
  async feed(operatorId: string, take = 12) {
    const scope = await scopeFor(operatorId);
    const where = AdminNotifyRepository.visibilityWhere(scope);
    const rows = await AdminNotifyRepository.list(where, take);
    const reads = await AdminNotifyRepository.readsFor(
      operatorId,
      rows.map((row) => row.id),
    );
    const readSet = new Set(reads.map((read) => read.notificationId));
    const items = rows.map((row) => toDto(row, readSet.has(row.id)));
    const unread = items.filter((item) => !item.read).length;
    return { items, unread };
  },

  async unreadCount(operatorId: string) {
    const scope = await scopeFor(operatorId);
    const where = AdminNotifyRepository.visibilityWhere(scope);
    // Recent window is enough for a badge; older items are assumed acknowledged.
    const rows = await AdminNotifyRepository.list(where, 100);
    const reads = await AdminNotifyRepository.readsFor(
      operatorId,
      rows.map((row) => row.id),
    );
    const readSet = new Set(reads.map((read) => read.notificationId));
    return { count: rows.filter((row) => !readSet.has(row.id)).length };
  },

  /** Header counts for the notifications page. */
  async stats(operatorId: string) {
    const scope = await scopeFor(operatorId);
    const where = AdminNotifyRepository.visibilityWhere(scope);
    const [total, grouped, unread] = await Promise.all([
      AdminNotifyRepository.count(where),
      AdminNotifyRepository.typeCounts(where),
      this.unreadCount(operatorId),
    ]);
    const byType = Object.fromEntries(
      grouped.map((group) => [group.type, group._count._all]),
    ) as Record<string, number>;
    return { total, unread: unread.count, byType };
  },

  async markRead(operatorId: string, id: string) {
    const scope = await scopeFor(operatorId);
    const notification = await AdminNotifyRepository.getById(id);
    if (!notification) throw new AppError(404, 'Q-404', 'Notification not found.');
    if (
      !scope.isSuperAdmin &&
      notification.permission &&
      !scope.permissions.includes(notification.permission)
    ) {
      throw new AppError(403, 'Q-403', 'You cannot access this notification.');
    }
    await AdminNotifyRepository.markRead(operatorId, id);
    return { success: true };
  },

  async markAllRead(operatorId: string) {
    const scope = await scopeFor(operatorId);
    const where = AdminNotifyRepository.visibilityWhere(scope);
    const rows = await AdminNotifyRepository.list(where, 200);
    await AdminNotifyRepository.markManyRead(
      operatorId,
      rows.map((row) => row.id),
    );
    return { success: true };
  },

  /** Recipient counts per audience segment (for the compose form). */
  async audienceCounts() {
    const [all, freelancers, clients] = await Promise.all([
      AdminNotifyRepository.audienceCount('ALL'),
      AdminNotifyRepository.audienceCount('FREELANCERS'),
      AdminNotifyRepository.audienceCount('CLIENTS'),
    ]);
    return { ALL: all, FREELANCERS: freelancers, CLIENTS: clients };
  },

  /**
   * Send an announcement to end users across the chosen channels (always an
   * in-app notification; email/push/sms are delivered too). Gated on
   * `broadcasts.send` at the route; audited and mirrored to the operator feed.
   */
  async broadcast(actorId: string, input: BroadcastInput) {
    const channels = [...new Set<NotificationChannel>(['IN_APP', ...input.channels])];
    const recipients = await AdminNotifyRepository.audienceUserIds(input.audience);
    if (recipients.length > 0) {
      await AdminNotifyRepository.createUserNotifications(recipients, {
        category: input.category,
        title: input.title,
        body: input.body,
        channels,
      });
    }
    void recordAudit({
      actorId,
      action: 'broadcast.send',
      entityType: 'Broadcast',
      after: {
        title: input.title,
        audience: input.audience,
        category: input.category,
        channels,
        recipients: recipients.length,
      },
    });
    void emitAdminEvent({
      type: 'BROADCAST_SENT',
      severity: 'INFO',
      title: 'Broadcast sent',
      body: `“${input.title}” was sent to ${recipients.length} ${AUDIENCE_LABEL[input.audience]}.`,
      permission: 'broadcasts.send',
      entityType: 'Broadcast',
      actorId,
    });
    return { success: true, recipients: recipients.length };
  },

  /** Recent broadcasts (from the audit trail) for the page's history panel. */
  async recentBroadcasts(_operatorId: string) {
    const entries = await AdminNotifyRepository.recentBroadcasts(20);
    const actorIds = [...new Set(entries.map((entry) => entry.actorId).filter(Boolean))] as string[];
    const actors = await AdminNotifyRepository.actorNames(actorIds);
    const byId = new Map(actors.map((actor) => [actor.id, actor]));
    return entries.map((entry) => {
      const after = (entry.afterState ?? {}) as Record<string, unknown>;
      return {
        id: entry.id,
        title: String(after.title ?? 'Broadcast'),
        audience: String(after.audience ?? 'ALL'),
        category: String(after.category ?? 'SYSTEM'),
        channels: Array.isArray(after.channels) ? (after.channels as string[]) : ['IN_APP'],
        recipients: Number(after.recipients ?? 0),
        sentBy: entry.actorId ? (byId.get(entry.actorId)?.fullName ?? 'Operator') : 'System',
        createdAt: entry.createdAt.toISOString(),
      };
    });
  },

  // ---- Notification templates (notifications.manage) ----

  async listTemplates() {
    const templates = await AdminNotifyRepository.listTemplates();
    return templates.map((template) => ({
      key: template.key,
      name: template.name,
      category: template.category,
      channels: template.channels,
      subject: template.subject,
      body: template.body,
      variables: template.variables,
      updatedAt: template.updatedAt.toISOString(),
    }));
  },

  async updateTemplate(actorId: string, key: string, input: UpdateTemplateInput) {
    const existing = await AdminNotifyRepository.getTemplate(key);
    if (!existing) throw new AppError(404, 'Q-404', 'Template not found.');
    await AdminNotifyRepository.updateTemplate(key, {
      subject: input.subject,
      body: input.body,
      channels: input.channels as NotificationChannel[],
      updatedById: actorId,
    });
    void recordAudit({
      actorId,
      action: 'notification.template.update',
      entityType: 'NotificationTemplate',
      entityId: key,
      before: { subject: existing.subject, channels: existing.channels },
      after: { subject: input.subject, channels: input.channels },
    });
    return this.listTemplates();
  },

  /** Render a template's variables with sample values and email it to the operator. */
  async sendTestTemplate(actorId: string, key: string) {
    const template = await AdminNotifyRepository.getTemplate(key);
    if (!template) throw new AppError(404, 'Q-404', 'Template not found.');
    const operator = await prisma.user.findUnique({
      where: { id: actorId },
      select: { email: true, fullName: true },
    });
    if (!operator?.email) throw new AppError(400, 'Q-400', 'Your account has no email on file.');

    const samples: Record<string, string> = {
      first_name: operator.fullName.split(' ')[0] || 'there',
      currency: 'USD',
      verify_link: 'https://app.bizik.cm/verify/sample',
      reason: 'Document was blurry',
      actor: 'A counterparty',
      milestone: 'Design phase',
      amount: '1,500.00 USD',
      project: 'Sample project',
      method: 'MTN MoMo',
      reference: 'QTX-SAMPLE-0001',
    };
    const fill = (text: string) =>
      text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => samples[name] ?? `{{${name}}}`);

    await sendEmail(operator.email, `[Test] ${fill(template.subject)}`, fill(template.body));
    void recordAudit({
      actorId,
      action: 'notification.template.test',
      entityType: 'NotificationTemplate',
      entityId: key,
      after: { sentTo: operator.email },
    });
    return { success: true, sentTo: operator.email };
  },

  // ---- In-contract message moderation (messages.moderate) ----

  async moderationQueue(status: 'PENDING' | 'RESOLVED' | 'ALL' = 'PENDING') {
    const statuses: ('PENDING' | 'REMOVED' | 'DISMISSED')[] =
      status === 'PENDING'
        ? ['PENDING']
        : status === 'RESOLVED'
          ? ['REMOVED', 'DISMISSED']
          : ['PENDING', 'REMOVED', 'DISMISSED'];
    const reports = await AdminNotifyRepository.reportsByStatus(statuses);

    const threadIds = [...new Set(reports.map((report) => report.message.threadId))];
    const threads = await AdminNotifyRepository.threadContractIds(threadIds);
    const contractByThread = new Map(threads.map((thread) => [thread.id, thread.contractId]));
    const contracts = await AdminNotifyRepository.contractsByIds(
      [...new Set(threads.map((thread) => thread.contractId))],
    );
    const contractById = new Map(contracts.map((contract) => [contract.id, contract]));

    const userIds = [
      ...new Set(
        reports
          .flatMap((report) => [
            report.message.senderId,
            report.message.recipientId,
            report.resolvedById,
          ])
          .filter(Boolean),
      ),
    ] as string[];
    const users = await AdminNotifyRepository.actorNames(userIds);
    const nameById = new Map(users.map((user) => [user.id, user.fullName]));

    return reports.map((report) => {
      const contractId = contractByThread.get(report.message.threadId);
      const contract = contractId ? contractById.get(contractId) : undefined;
      return {
        id: report.id,
        reason: report.reason,
        source: report.source,
        status: report.status,
        senderId: report.message.senderId,
        senderName: nameById.get(report.message.senderId) ?? 'Unknown',
        recipientId: report.message.recipientId ?? null,
        recipientName: report.message.recipientId
          ? (nameById.get(report.message.recipientId) ?? 'Unknown')
          : '-',
        contractId: contractId ?? null,
        contractTitle: contract?.title ?? 'Project',
        messageBody: report.message.body,
        messageRemoved: report.message.removedAt !== null,
        resolvedByName: report.resolvedById
          ? (nameById.get(report.resolvedById) ?? 'A moderator')
          : null,
        resolvedAt: report.resolvedAt ? report.resolvedAt.toISOString() : null,
        createdAt: report.createdAt.toISOString(),
      };
    });
  },

  async moderationCount() {
    return { count: await AdminNotifyRepository.pendingReportCount() };
  },

  /** Full conversation around a reported message, so a moderator has context. */
  async moderationThread(reportId: string) {
    const report = await AdminNotifyRepository.getReport(reportId);
    if (!report) throw new AppError(404, 'Q-404', 'Report not found.');
    const messages = await AdminNotifyRepository.threadMessages(report.message.threadId);
    const userIds = [
      ...new Set(messages.flatMap((message) => [message.senderId, message.recipientId]).filter(Boolean)),
    ] as string[];
    const users = await AdminNotifyRepository.actorNames(userIds);
    const nameById = new Map(users.map((user) => [user.id, user.fullName]));
    return {
      reportedMessageId: report.messageId,
      messages: messages.map((message) => ({
        id: message.id,
        senderName: nameById.get(message.senderId) ?? 'Unknown',
        body: message.removedAt ? '[Message removed by moderator]' : message.body,
        removed: message.removedAt !== null,
        isReported: message.id === report.messageId,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  },

  async removeReportedMessage(actorId: string, id: string) {
    const report = await AdminNotifyRepository.getReport(id);
    if (!report) throw new AppError(404, 'Q-404', 'Report not found.');
    if (report.status !== 'PENDING') throw new AppError(409, 'Q-409', 'This report is already resolved.');
    await AdminNotifyRepository.removeMessage(report.messageId);
    await AdminNotifyRepository.resolveReport(id, 'REMOVED', actorId);
    void this.notifyMessageRemoved(report.message.senderId, report.message.threadId);
    void recordAudit({
      actorId,
      action: 'message.remove',
      entityType: 'Message',
      entityId: report.messageId,
      after: { reportId: id, reason: report.reason },
    });
    return { success: true };
  },

  /** Best-effort in-app notice to the sender that their message was removed. */
  async notifyMessageRemoved(senderId: string, threadId: string) {
    try {
      const thread = (await AdminNotifyRepository.threadContractIds([threadId]))[0];
      const contract = thread
        ? (await AdminNotifyRepository.contractsByIds([thread.contractId]))[0]
        : undefined;
      await prisma.notification.create({
        data: {
          userId: senderId,
          category: 'SYSTEM',
          title: 'A message was removed',
          body: `One of your messages${
            contract ? ` in “${contract.title}”` : ''
          } was removed by a moderator for violating our community guidelines. Please keep conversations respectful and on-platform.`,
          channels: ['IN_APP'],
          entityType: 'message',
          deliveries: { create: [{ channel: 'IN_APP', status: 'DELIVERED' }] },
        },
      });
    } catch (error) {
      console.error('[moderation] notify sender failed:', (error as Error).message);
    }
  },

  async dismissReport(actorId: string, id: string) {
    const report = await AdminNotifyRepository.getReport(id);
    if (!report) throw new AppError(404, 'Q-404', 'Report not found.');
    if (report.status !== 'PENDING') throw new AppError(409, 'Q-409', 'This report is already resolved.');
    await AdminNotifyRepository.resolveReport(id, 'DISMISSED', actorId);
    void recordAudit({
      actorId,
      action: 'message.report.dismiss',
      entityType: 'MessageReport',
      entityId: id,
      after: { messageId: report.messageId },
    });
    return { success: true };
  },
};
