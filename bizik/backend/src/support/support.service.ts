import {
  SupportMessage,
  SupportTicket,
  SupportTicketStatus,
} from '@prisma/client';

import { AppError } from '../lib/errors';
import { emitAdminEvent } from '../lib/admin-events';
import { SupportRepository } from './support.repository';
import { CreateTicketInput } from './support.validation';

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

function listDto(ticket: SupportTicket & { messages: SupportMessage[] }) {
  const last = ticket.messages[0];
  return {
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    categoryLabel: CATEGORY_LABEL[ticket.category] ?? ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    statusLabel: STATUS_LABEL[ticket.status],
    preview: last?.body ?? '',
    lastFromStaff: last?.authorType === 'STAFF',
    lastMessageAt: ticket.lastMessageAt.toISOString(),
    createdAt: ticket.createdAt.toISOString(),
  };
}

export const SupportService = {
  async listMy(userId: string) {
    const tickets = await SupportRepository.ticketsByUser(userId);
    return tickets.map(listDto);
  },

  async detail(userId: string, id: string) {
    const ticket = await SupportRepository.ticketById(id);
    if (!ticket || ticket.userId !== userId) {
      throw new AppError(404, 'Q-404', 'Ticket not found.');
    }
    return this.serializeDetail(ticket, userId);
  },

  async create(userId: string, input: CreateTicketInput) {
    const user = await SupportRepository.userNames([userId]);
    const requester = user[0];
    const ticket = await SupportRepository.createTicket({
      userId,
      subject: input.subject,
      category: input.category,
      priority: 'NORMAL',
    });
    await SupportRepository.addMessage({
      ticketId: ticket.id,
      senderId: userId,
      authorType: 'USER',
      body: input.body,
    });
    void emitAdminEvent({
      type: 'SYSTEM',
      severity: 'INFO',
      title: 'New support ticket',
      body: `${requester?.fullName ?? 'A user'} opened “${input.subject}”.`,
      permission: 'support.view',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      link: `/support?ticket=${ticket.id}`,
      actorId: userId,
    });
    return this.detail(userId, ticket.id);
  },

  async reply(userId: string, id: string, body: string) {
    const ticket = await SupportRepository.ticketById(id);
    if (!ticket || ticket.userId !== userId) {
      throw new AppError(404, 'Q-404', 'Ticket not found.');
    }
    if (ticket.status === 'CLOSED') {
      throw new AppError(409, 'Q-409', 'This ticket is closed. Please open a new request.');
    }
    await SupportRepository.addMessage({ ticketId: id, senderId: userId, authorType: 'USER', body });
    // A user reply reopens a resolved ticket and moves it back to the team.
    await SupportRepository.updateTicket(id, {
      status: 'OPEN',
      lastMessageAt: new Date(),
    });
    void emitAdminEvent({
      type: 'SYSTEM',
      severity: 'INFO',
      title: 'Support ticket reply',
      body: `A user replied on “${ticket.subject}”.`,
      permission: 'support.view',
      entityType: 'SupportTicket',
      entityId: id,
      link: `/support?ticket=${id}`,
      actorId: userId,
    });
    return this.detail(userId, id);
  },

  /** Published help-center articles grouped by category. */
  async help() {
    const articles = await SupportRepository.publishedArticles();
    return articles.map((article) => ({
      id: article.id,
      category: article.category,
      title: article.title,
      slug: article.slug,
      body: article.body,
    }));
  },

  /** Shared serializer - resolves sender names + the viewer's "mine" flag. */
  async serializeDetail(
    ticket: SupportTicket & { messages: SupportMessage[] },
    viewerId: string,
  ) {
    const senderIds = [...new Set(ticket.messages.map((message) => message.senderId))];
    const senders = await SupportRepository.userNames(senderIds);
    const nameById = new Map(senders.map((sender) => [sender.id, sender.fullName]));
    return {
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      categoryLabel: CATEGORY_LABEL[ticket.category] ?? ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      statusLabel: STATUS_LABEL[ticket.status],
      createdAt: ticket.createdAt.toISOString(),
      lastMessageAt: ticket.lastMessageAt.toISOString(),
      canReply: ticket.status !== 'CLOSED',
      messages: ticket.messages.map((message) => ({
        id: message.id,
        body: message.body,
        authorType: message.authorType,
        mine: message.senderId === viewerId,
        senderName:
          message.authorType === 'STAFF'
            ? (nameById.get(message.senderId) ?? 'BiZik Support')
            : (nameById.get(message.senderId) ?? 'You'),
        createdAt: message.createdAt.toISOString(),
      })),
    };
  },
};
