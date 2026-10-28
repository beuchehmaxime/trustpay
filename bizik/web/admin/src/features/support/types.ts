/** Support console types - mirrors backend SupportAdminService (SRS MOD-13). */

export type TicketStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TicketCategory = 'PAYMENTS' | 'KYC' | 'DISPUTES' | 'ACCOUNT' | 'TECHNICAL' | 'OTHER';
export type AuthorType = 'USER' | 'STAFF';

export interface TicketListItem {
  id: string;
  subject: string;
  category: TicketCategory;
  categoryLabel: string;
  priority: TicketPriority;
  status: TicketStatus;
  statusLabel: string;
  requesterName: string;
  requesterEmail: string | null;
  preview: string;
  lastFromStaff: boolean;
  lastMessageAt: string;
  createdAt: string;
}

export interface TicketMessage {
  id: string;
  body: string;
  authorType: AuthorType;
  senderName: string;
  createdAt: string;
}

export interface TicketDetail {
  id: string;
  subject: string;
  category: TicketCategory;
  categoryLabel: string;
  priority: TicketPriority;
  status: TicketStatus;
  statusLabel: string;
  requesterName: string;
  requesterEmail: string | null;
  assignedToName: string | null;
  createdAt: string;
  lastMessageAt: string;
  messages: TicketMessage[];
}

export interface SupportStats {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  unresolved: number;
}

export interface TicketFilters {
  status?: TicketStatus;
  search?: string;
}

export interface HelpArticle {
  id: string;
  category: string;
  title: string;
  slug: string;
  body: string;
  published: boolean;
  order: number;
  updatedAt: string;
}

export interface HelpArticleInput {
  category: string;
  title: string;
  slug?: string;
  body: string;
  published: boolean;
  order: number;
}
