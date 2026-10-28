import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { DashboardOverview } from './types';

/** The permission-scoped admin dashboard payload. */
export function useDashboard(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => {
      const { data } = await api.get<DashboardOverview>(endpoints.admin.dashboard);
      return data;
    },
    enabled,
    staleTime: 60_000,
  });
}
