import { useQuery } from '@tanstack/react-query';

import { auditApi } from './audit.api';
import type { AuditFilters } from './types';

const AUDIT_KEY = ['admin', 'audit'] as const;

export function useAuditLog(filters: AuditFilters) {
  return useQuery({
    queryKey: [...AUDIT_KEY, 'list', filters],
    queryFn: () => auditApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useAuditFilters() {
  return useQuery({
    queryKey: [...AUDIT_KEY, 'filters'],
    queryFn: auditApi.filters,
    staleTime: 60_000,
  });
}
