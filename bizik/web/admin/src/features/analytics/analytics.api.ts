import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { AnalyticsOverview, GeneratedReport, ReportRow, ReportType } from './types';

/** Admin reports & analytics calls (SRS MOD-12). */
export const analyticsApi = {
  async overview(from: string, to: string) {
    const { data } = await api.get<AnalyticsOverview>(endpoints.admin.analyticsOverview, {
      params: { from, to },
    });
    return data;
  },
  async reports() {
    const { data } = await api.get<ReportRow[]>(endpoints.admin.analyticsReports);
    return data;
  },
  async generate(type: ReportType) {
    const { data } = await api.post<GeneratedReport>(endpoints.admin.analyticsGenerate, { type });
    return data;
  },
};
