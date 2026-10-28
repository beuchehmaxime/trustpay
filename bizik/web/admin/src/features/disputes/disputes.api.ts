import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  DisputeDetail,
  DisputeFilters,
  DisputeListItem,
  DisputeStats,
  Mediator,
  Paginated,
  RuleInput,
} from './types';

/** Admin dispute mediation calls (SRS MOD-11). */
export const disputesApi = {
  async list(filters: DisputeFilters = {}) {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
    );
    const { data } = await api.get<Paginated<DisputeListItem>>(endpoints.admin.disputes, { params });
    return data;
  },
  async stats(opts: { silent?: boolean } = {}) {
    const { data } = await api.get<DisputeStats>(endpoints.admin.disputeStats, {
      silent: opts.silent,
    });
    return data;
  },
  async mediators() {
    const { data } = await api.get<Mediator[]>(endpoints.admin.disputeMediators);
    return data;
  },
  async detail(id: string) {
    const { data } = await api.get<DisputeDetail>(endpoints.admin.dispute(id));
    return data;
  },
  async assign(id: string, mediatorId: string) {
    const { data } = await api.post<DisputeDetail>(endpoints.admin.disputeAssign(id), { mediatorId });
    return data;
  },
  async escalate(id: string, note?: string) {
    const { data } = await api.post<DisputeDetail>(endpoints.admin.disputeEscalate(id), { note });
    return data;
  },
  async message(id: string, body: string) {
    const { data } = await api.post<DisputeDetail>(endpoints.admin.disputeMessage(id), { body });
    return data;
  },
  async rule(id: string, input: RuleInput) {
    const { data } = await api.post<DisputeDetail>(endpoints.admin.disputeRule(id), input);
    return data;
  },
};
