import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { businessAnalyticsApi } from './business.api';
import type { CostCategory } from './business.types';

const KEY = ['admin', 'business-analytics'] as const;

// `enabled` is passed explicitly by the caller rather than inferred, because the
// overview renders both halves and an operator usually holds only one of the two
// permissions. Without it the page would fire a request it knows will come back
// 403, which fills the audit trail with denials that mean nothing.

export function useProductAnalytics(days = 30, enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'product', days],
    queryFn: () => businessAnalyticsApi.product(days),
    enabled,
    // These are aggregates over the whole history; they do not move minute to
    // minute, and recomputing them on every focus would be a lot of SQL for no
    // new information.
    staleTime: 5 * 60 * 1000,
  });
}

export function useFinancialAnalytics(month?: string, enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'financial', month ?? 'current'],
    queryFn: () => businessAnalyticsApi.financial(month),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useOperatingCosts(enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'costs'],
    queryFn: () => businessAnalyticsApi.costs(),
    enabled,
  });
}

export function useSaveCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { month: string; category: CostCategory; amountXaf: number; note?: string }) =>
      businessAnalyticsApi.saveCost(input),
    // Costs feed EBITDA, so both the cost list and the financial view are stale
    // the moment one changes.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => businessAnalyticsApi.deleteCost(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
