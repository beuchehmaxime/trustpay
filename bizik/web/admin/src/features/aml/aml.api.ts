import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  AmlAlert,
  AmlAlertDetail,
  AmlFilters,
  AmlStats,
  AmlTimelineEvent,
} from './types';

/** Admin AML / sanctions case-management calls (SRS MOD-10). */
export const amlApi = {
  async list(filters: AmlFilters = {}, opts: { silent?: boolean } = {}) {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
    );
    const { data } = await api.get<AmlAlert[]>(endpoints.admin.amlAlerts, {
      params,
      silent: opts.silent,
    });
    return data;
  },
  async stats(opts: { silent?: boolean } = {}) {
    const { data } = await api.get<AmlStats>(endpoints.admin.amlStats, { silent: opts.silent });
    return data;
  },
  async detail(id: string) {
    const { data } = await api.get<AmlAlertDetail>(endpoints.admin.amlAlert(id));
    return data;
  },
  async timeline(id: string) {
    const { data } = await api.get<AmlTimelineEvent[]>(endpoints.admin.amlTimeline(id));
    return data;
  },
  async addNote(id: string, note: string) {
    const { data } = await api.post<AmlTimelineEvent[]>(endpoints.admin.amlNote(id), { note });
    return data;
  },
  async review(id: string) {
    const { data } = await api.post<AmlAlertDetail>(endpoints.admin.amlReview(id));
    return data;
  },
  async clear(id: string, note?: string) {
    const { data } = await api.post<AmlAlertDetail>(endpoints.admin.amlClear(id), { note });
    return data;
  },
  async escalate(id: string, note?: string) {
    const { data } = await api.post<AmlAlertDetail>(endpoints.admin.amlEscalate(id), { note });
    return data;
  },
  async fileSar(id: string, narrative: string) {
    const { data } = await api.post<AmlAlertDetail>(endpoints.admin.amlFileSar(id), { narrative });
    return data;
  },
  async freeze(id: string) {
    const { data } = await api.post<AmlAlertDetail>(endpoints.admin.amlFreeze(id));
    return data;
  },
};
