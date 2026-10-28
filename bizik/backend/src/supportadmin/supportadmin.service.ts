import {
  SupportMessage,
  SupportPriority,
  SupportTicket,
  SupportTicketStatus,
} from '@prisma/client';

import { AppError } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { sendEmail } from '../lib/notify';
import { prisma } from '../lib/prisma';
import { SupportRepository } from '../support/support.repository';
import { HelpArticleInput } from './supportadmin.validation';

const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: 'Open',
  PENDING: 'Pending',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const CATEGORY_LABEL: Record<string, string> = {
  PAYMENTS: 'Payments',
  KYC: 'Verification',
  DISPUTES: 'Disputes',
  ACCOUNT: 'Account',
  TECHNICAL: 'Technical',
  OTHER: 'Other',
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || `article-${Date.now()}`;
}

async function loadTicket(id: string) {
  const ticket = await SupportRepository.ticketById(id);
  if (!ticket) throw new AppError(404, 'Q-404', 'Ticket not found.');
  return ticket;
}

export const SupportAdminService = {
  async list(filter: { status?: SupportTicketStatus; search?: string }) {
    const tickets = await SupportRepository.listTickets({ status: filter.status });
    const userIds = [...new Set(tickets.map((ticket) => ticket.userId))];
    const users = await SupportRepository.userNames(userIds);
    const byId = new Map(users.map((user) => [user.id, user]));

    let items = tickets.map((ticket) => {
      const last = ticket.messages[0];
      const requester = byId.get(ticket.userId);
      return {
        id: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        categoryLabel: CATEGORY_LABEL[ticket.category] ?? ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        statusLabel: STATUS_LABEL[ticket.status],
        requesterName: requester?.fullName ?? 'Unknown',
        requesterEmail: requester?.email ?? null,
        preview: last?.body ?? '',
        lastFromStaff: last?.authorType === 'STAFF',
        lastMessageAt: ticket.lastMessageAt.toISOString(),
        createdAt: ticket.createdAt.toISOString(),
      };
    });
    if (filter.search) {
      const needle = filter.search.trim().toLowerCase();
      items = items.filter((item) =>
        `${item.subject} ${item.requesterName} ${item.requesterEmail ?? ''}`
          .toLowerCase()
          .includes(needle),
      );
    }
    return items;
  },

  async stats() {
    const counts = await SupportRepository.statusCounts();
    return {
      open: counts.OPEN,
      pending: counts.PENDING,
      resolved: counts.RESOLVED,
      closed: counts.CLOSED,
      unresolved: counts.OPEN + counts.PENDING,
    };
  },

  async detail(id: string) {
    const ticket = await loadTicket(id);
    return this.serialize(ticket);
  },

  async reply(operatorId: string, id: string, body: string) {
    const ticket = await loadTicket(id);
    await SupportRepository.addMessage({
      ticketId: id,
      senderId: operatorId,
      authorType: 'STAFF',
      body,
    });
    // A staff reply moves the ticket to "pending" the user's response.
    const nextStatus: SupportTicketStatus =
      ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? ticket.status : 'PENDING';
    await SupportRepository.updateTicket(id, {
      status: nextStatus,
      lastMessageAt: new Date(),
      assignedToId: ticket.assignedToId ?? operatorId,
    });
    void recordAudit({
      actorId: operatorId,
      action: 'support.reply',
      entityType: 'SupportTicket',
      entityId: id,
    });
    void this.notifyUser(ticket, body);
    return this.detail(id);
  },

  async setStatus(operatorId: string, id: string, status: SupportTicketStatus) {
    const ticket = await loadTicket(id);
    await SupportRepository.updateTicket(id, { status });
    void recordAudit({
      actorId: operatorId,
      action: 'support.status',
      entityType: 'SupportTicket',
      entityId: id,
      before: { status: ticket.status },
      after: { status },
    });
    return this.detail(id);
  },

  async setPriority(operatorId: string, id: string, priority: SupportPriority) {
    const ticket = await loadTicket(id);
    await SupportRepository.updateTicket(id, { priority });
    void recordAudit({
      actorId: operatorId,
      action: 'support.priority',
      entityType: 'SupportTicket',
      entityId: id,
      before: { priority: ticket.priority },
      after: { priority },
    });
    return this.detail(id);
  },

  async assign(operatorId: string, id: string) {
    await loadTicket(id);
    await SupportRepository.updateTicket(id, { assignedToId: operatorId });
    return this.detail(id);
  },

  /** Notify the ticket owner of a staff reply - in-app + email. Best effort. */
  async notifyUser(ticket: SupportTicket, body: string) {
    try {
      const [user] = await SupportRepository.userNames([ticket.userId]);
      if (!user) return;
      await prisma.notification.create({
        data: {
          userId: ticket.userId,
          category: 'SYSTEM',
          title: 'Support replied to your request',
          body: `Re: “${ticket.subject}” - ${body.slice(0, 140)}`,
          channels: ['IN_APP', 'EMAIL'],
          entityType: 'support',
          entityId: ticket.id,
          deliveries: {
            create: [
              { channel: 'IN_APP', status: 'DELIVERED' },
              { channel: 'EMAIL', status: 'SENT' },
            ],
          },
        },
      });
      if (user.email) {
        void sendEmail(
          user.email,
          `BiZik Support · ${ticket.subject}`,
          `Our support team replied to your request "${ticket.subject}":\n\n${body}\n\nReply in the BiZik app to continue the conversation.`,
        ).catch(() => undefined);
      }
    } catch (error) {
      console.warn('[support] notify user failed', (error as Error).message);
    }
  },

  async serialize(ticket: SupportTicket & { messages: SupportMessage[] }) {
    const [requester] = await SupportRepository.userNames([ticket.userId]);
    const senderIds = [...new Set(ticket.messages.map((message) => message.senderId))];
    const senders = await SupportRepository.userNames(senderIds);
    const nameById = new Map(senders.map((sender) => [sender.id, sender.fullName]));
    const assigned = ticket.assignedToId
      ? (await SupportRepository.userNames([ticket.assignedToId]))[0]
      : undefined;
    return {
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      categoryLabel: CATEGORY_LABEL[ticket.category] ?? ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      statusLabel: STATUS_LABEL[ticket.status],
      requesterName: requester?.fullName ?? 'Unknown',
      requesterEmail: requester?.email ?? null,
      assignedToName: assigned?.fullName ?? null,
      createdAt: ticket.createdAt.toISOString(),
      lastMessageAt: ticket.lastMessageAt.toISOString(),
      messages: ticket.messages.map((message) => ({
        id: message.id,
        body: message.body,
        authorType: message.authorType,
        senderName:
          message.authorType === 'STAFF'
            ? (nameById.get(message.senderId) ?? 'Support')
            : (nameById.get(message.senderId) ?? requester?.fullName ?? 'User'),
        createdAt: message.createdAt.toISOString(),
      })),
    };
  },

  // ---- Help center ----
  async listArticles() {
    const articles = await SupportRepository.allArticles();
    return articles.map((article) => ({
      id: article.id,
      category: article.category,
      title: article.title,
      slug: article.slug,
      body: article.body,
      published: article.published,
      order: article.order,
      updatedAt: article.updatedAt.toISOString(),
    }));
  },

  async createArticle(operatorId: string, input: HelpArticleInput) {
    const slug = input.slug?.trim() || slugify(input.title);
    const article = await SupportRepository.createArticle({
      category: input.category,
      title: input.title,
      slug,
      body: input.body,
      published: input.published,
      order: input.order,
      updatedById: operatorId,
    });
    void recordAudit({
      actorId: operatorId,
      action: 'support.help.create',
      entityType: 'HelpArticle',
      entityId: article.id,
    });
    return this.listArticles();
  },

  async updateArticle(operatorId: string, id: string, input: HelpArticleInput) {
    const existing = await SupportRepository.articleById(id);
    if (!existing) throw new AppError(404, 'Q-404', 'Article not found.');
    await SupportRepository.updateArticle(id, {
      category: input.category,
      title: input.title,
      slug: input.slug?.trim() || existing.slug,
      body: input.body,
      published: input.published,
      order: input.order,
      updatedById: operatorId,
    });
    void recordAudit({
      actorId: operatorId,
      action: 'support.help.update',
      entityType: 'HelpArticle',
      entityId: id,
    });
    return this.listArticles();
  },

  async deleteArticle(operatorId: string, id: string) {
    const existing = await SupportRepository.articleById(id);
    if (!existing) throw new AppError(404, 'Q-404', 'Article not found.');
    await SupportRepository.deleteArticle(id);
    void recordAudit({
      actorId: operatorId,
      action: 'support.help.delete',
      entityType: 'HelpArticle',
      entityId: id,
    });
    return this.listArticles();
  },
};
