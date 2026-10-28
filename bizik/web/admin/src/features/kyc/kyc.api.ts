import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { KycQueueFilters, KycReviewItem } from './types';

/** Admin KYC review-queue calls (SRS MOD-09, FR-ADM-001). */
export const adminKycApi = {
  async queue(filters: KycQueueFilters = {}, opts: { silent?: boolean } = {}) {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
    );
    const { data } = await api.get<KycReviewItem[]>(endpoints.admin.kycQueue, {
      params,
      silent: opts.silent,
    });
    return data;
  },
  async detail(id: string) {
    const { data } = await api.get<KycReviewItem>(endpoints.admin.kycDetail(id));
    return data;
  },
  async approve(id: string) {
    const { data } = await api.post<KycReviewItem>(endpoints.admin.kycApprove(id));
    return data;
  },
  async reject(id: string, reason: string) {
    const { data } = await api.post<KycReviewItem>(endpoints.admin.kycReject(id), { reason });
    return data;
  },
  async requestDocs(id: string, reason: string) {
    const { data } = await api.post<KycReviewItem>(endpoints.admin.kycRequestDocs(id), { reason });
    return data;
  },
  async escalate(id: string) {
    const { data } = await api.post<KycReviewItem>(endpoints.admin.kycEscalate(id));
    return data;
  },
};
