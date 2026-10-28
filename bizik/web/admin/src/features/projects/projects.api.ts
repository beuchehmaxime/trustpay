import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  ContractTemplate,
  Paginated,
  ProjectDetail,
  ProjectFilters,
  ProjectListItem,
  ProjectStats,
} from './types';

/** Admin projects & contracts oversight calls (SRS MOD-05/06). */
export const projectsApi = {
  async list(filters: ProjectFilters = {}) {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
    );
    const { data } = await api.get<Paginated<ProjectListItem>>(endpoints.admin.projects, { params });
    return data;
  },
  async stats() {
    const { data } = await api.get<ProjectStats>(endpoints.admin.projectStats);
    return data;
  },
  async detail(id: string) {
    const { data } = await api.get<ProjectDetail>(endpoints.admin.project(id));
    return data;
  },
  async forceCancel(id: string, reason?: string) {
    const { data } = await api.post<ProjectDetail>(endpoints.admin.projectForceCancel(id), { reason });
    return data;
  },
  async forceComplete(id: string) {
    const { data } = await api.post<ProjectDetail>(endpoints.admin.projectForceComplete(id));
    return data;
  },
  async templates() {
    const { data } = await api.get<ContractTemplate[]>(endpoints.admin.projectTemplates);
    return data;
  },
  async deleteTemplate(id: string) {
    await api.delete(endpoints.admin.projectTemplate(id));
  },
};
