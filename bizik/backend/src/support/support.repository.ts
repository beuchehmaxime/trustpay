import {
  Prisma,
  SupportAuthorType,
  SupportCategory,
  SupportPriority,
  SupportTicketStatus,
} from '@prisma/client';

import { prisma } from '../lib/prisma';

/** Shared data access for the help desk (user + admin surfaces). */
export const SupportRepository = {
  // ---- Tickets ----
  createTicket(data: {
    userId: string;
    subject: string;
    category: SupportCategory;
    priority: SupportPriority;
  }) {
    return prisma.supportTicket.create({ data });
  },

  ticketById(id: string) {
    return prisma.supportTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  },

  ticketsByUser(userId: string) {
    return prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  },

  listTickets(filter: { status?: SupportTicketStatus }) {
    return prisma.supportTicket.findMany({
      where: { status: filter.status },
      orderBy: [{ lastMessageAt: 'desc' }],
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  },

  addMessage(data: {
    ticketId: string;
    senderId: string;
    authorType: SupportAuthorType;
    body: string;
  }) {
    return prisma.supportMessage.create({ data });
  },

  updateTicket(id: string, data: Prisma.SupportTicketUncheckedUpdateInput) {
    return prisma.supportTicket.update({ where: { id }, data });
  },

  async statusCounts(): Promise<Record<SupportTicketStatus, number>> {
    const grouped = await prisma.supportTicket.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const base: Record<SupportTicketStatus, number> = {
      OPEN: 0,
      PENDING: 0,
      RESOLVED: 0,
      CLOSED: 0,
    };
    for (const row of grouped) base[row.status] = row._count._all;
    return base;
  },

  userNames(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, email: true, adminRoleId: true },
    });
  },

  // ---- Help articles ----
  publishedArticles() {
    return prisma.helpArticle.findMany({
      where: { published: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  },

  allArticles() {
    return prisma.helpArticle.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  },

  articleById(id: string) {
    return prisma.helpArticle.findUnique({ where: { id } });
  },

  createArticle(data: {
    category: string;
    title: string;
    slug: string;
    body: string;
    published: boolean;
    order: number;
    updatedById: string;
  }) {
    return prisma.helpArticle.create({ data });
  },

  updateArticle(id: string, data: Prisma.HelpArticleUncheckedUpdateInput) {
    return prisma.helpArticle.update({ where: { id }, data });
  },

  deleteArticle(id: string) {
    return prisma.helpArticle.delete({ where: { id } });
  },
};
