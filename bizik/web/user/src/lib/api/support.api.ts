import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * Support / help-desk service (SRS MOD-09) - user tickets + help center. Mirrors
 * the mobile app's `support.api.ts`. The backend returns both machine values and
 * display labels (`category`/`categoryLabel`, `status`/`statusLabel`).
 */

export type TicketStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type TicketCategory = 'PAYMENTS' | 'KYC' | 'DISPUTES' | 'ACCOUNT' | 'TECHNICAL' | 'OTHER';

export interface TicketListItem {
  id: string;
  subject: string;
  category: TicketCategory;
  categoryLabel: string;
  priority: string;
  status: TicketStatus;
  statusLabel: string;
  preview: string;
  lastFromStaff: boolean;
  lastMessageAt: string;
  createdAt: string;
}

export interface TicketMessage {
  id: string;
  body: string;
  authorType: 'USER' | 'STAFF';
  mine: boolean;
  senderName: string;
  createdAt: string;
}

export interface TicketDetail {
  id: string;
  subject: string;
  category: TicketCategory;
  categoryLabel: string;
  priority: string;
  status: TicketStatus;
  statusLabel: string;
  createdAt: string;
  lastMessageAt: string;
  canReply: boolean;
  messages: TicketMessage[];
}

export interface HelpArticle {
  id: string;
  category: string;
  title: string;
  slug: string;
  body: string;
}

export interface CreateTicketInput {
  subject: string;
  body: string;
  category: TicketCategory;
}

export const supportApi = {
  async help() {
    const { data } = await api.get<HelpArticle[]>(endpoints.support.help);
    return data;
  },
  async listTickets() {
    const { data } = await api.get<TicketListItem[]>(endpoints.support.tickets);
    return data;
  },
  async ticket(id: string) {
    const { data } = await api.get<TicketDetail>(endpoints.support.ticket(id));
    return data;
  },
  async create(input: CreateTicketInput) {
    const { data } = await api.post<TicketDetail>(endpoints.support.tickets, input);
    return data;
  },
  async reply(id: string, body: string) {
    const { data } = await api.post<TicketDetail>(endpoints.support.reply(id), { body });
    return data;
  },
};
