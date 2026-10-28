import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { projectsApi } from './projects.api';
import type { ProjectFilters } from './types';

const PROJECTS_KEY = ['admin', 'projects'] as const;

export function useProjects(filters: ProjectFilters) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'list', filters],
    queryFn: () => projectsApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useProjectStats() {
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'stats'],
    queryFn: projectsApi.stats,
    staleTime: 30_000,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'detail', id],
    queryFn: () => projectsApi.detail(id),
    enabled: !!id,
  });
}

/** Force-cancel / force-complete a contract; invalidates project queries. */
export function useProjectActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
  return {
    forceCancel: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
        projectsApi.forceCancel(id, reason),
      onSuccess: invalidate,
    }),
    forceComplete: useMutation({
      mutationFn: (id: string) => projectsApi.forceComplete(id),
      onSuccess: invalidate,
    }),
  };
}

export function useContractTemplates(enabled: boolean) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'templates'],
    queryFn: projectsApi.templates,
    enabled,
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectsApi.deleteTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...PROJECTS_KEY, 'templates'] }),
  });
}
