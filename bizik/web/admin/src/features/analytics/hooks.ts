import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { analyticsApi } from './analytics.api';
import type { ReportType } from './types';

const ANALYTICS_KEY = ['admin', 'analytics'] as const;

export function useAnalyticsOverview(from: string, to: string) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'overview', from, to],
    queryFn: () => analyticsApi.overview(from, to),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

export function useRecentReports(enabled: boolean) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'reports'],
    queryFn: analyticsApi.reports,
    enabled,
  });
}

export function useGenerateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (type: ReportType) => analyticsApi.generate(type),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...ANALYTICS_KEY, 'reports'] }),
  });
}
