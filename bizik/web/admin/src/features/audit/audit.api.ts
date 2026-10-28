import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { AuditEntry, AuditFilterOptions, AuditFilters, Paginated } from './types';

/** Admin audit log calls (SRS FR-ADM-006). */
export const auditApi = {
  async list(filters: AuditFilters = {}) {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
    );
    const { data } = await api.get<Paginated<AuditEntry>>(endpoints.admin.audit, { params });
    return data;
  },
  async filters() {
    const { data } = await api.get<AuditFilterOptions>(endpoints.admin.auditFilters);
    return data;
  },
};
