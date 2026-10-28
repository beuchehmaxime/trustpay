import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  HelpArticle,
  HelpArticleInput,
  SupportStats,
  TicketDetail,
  TicketFilters,
  TicketListItem,
  TicketPriority,
  TicketStatus,
} from './types';

/** Admin support console calls (SRS MOD-13). */
export const supportApi = {
  async list(filters: TicketFilters = {}, opts: { silent?: boolean } = {}) {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
    );
    const { data } = await api.get<TicketListItem[]>(endpoints.admin.supportTickets, {
      params,
      silent: opts.silent,
    });
    return data;
  },
  async stats(opts: { silent?: boolean } = {}) {
    const { data } = await api.get<SupportStats>(endpoints.admin.supportStats, { silent: opts.silent });
    return data;
  },
  async detail(id: string) {
    const { data } = await api.get<TicketDetail>(endpoints.admin.supportTicket(id));
    return data;
  },
  async reply(id: string, body: string) {
    const { data } = await api.post<TicketDetail>(endpoints.admin.supportReply(id), { body });
    return data;
  },
  async setStatus(id: string, status: TicketStatus) {
    const { data } = await api.put<TicketDetail>(endpoints.admin.supportStatus(id), { status });
    return data;
  },
  async setPriority(id: string, priority: TicketPriority) {
    const { data } = await api.put<TicketDetail>(endpoints.admin.supportPriority(id), { priority });
    return data;
  },
  // ---- Help center ----
  async articles() {
    const { data } = await api.get<HelpArticle[]>(endpoints.admin.supportHelp);
    return data;
  },
  async createArticle(input: HelpArticleInput) {
    const { data } = await api.post<HelpArticle[]>(endpoints.admin.supportHelp, input);
    return data;
  },
  async updateArticle(id: string, input: HelpArticleInput) {
    const { data } = await api.put<HelpArticle[]>(endpoints.admin.supportHelpItem(id), input);
    return data;
  },
  async deleteArticle(id: string) {
    const { data } = await api.delete<HelpArticle[]>(endpoints.admin.supportHelpItem(id));
    return data;
  },
};
