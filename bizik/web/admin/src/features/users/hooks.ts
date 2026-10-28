import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usersApi, type UserFilters } from './users.api';

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => usersApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useUsersStats() {
  return useQuery({ queryKey: ['users', 'stats'], queryFn: usersApi.stats, staleTime: 30_000 });
}

export function useUserProjects(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['users', 'projects', id],
    queryFn: () => usersApi.projects(id),
    enabled: enabled && !!id,
  });
}

/** Status actions that take the target user id - for inline actions in the list. */
export function useUserRowActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  return {
    suspend: useMutation({ mutationFn: (id: string) => usersApi.suspend(id), onSuccess: invalidate }),
    reactivate: useMutation({ mutationFn: (id: string) => usersApi.reactivate(id), onSuccess: invalidate }),
    unfreeze: useMutation({ mutationFn: (id: string) => usersApi.unfreeze(id), onSuccess: invalidate }),
  };
}

export function useUser(id: string) {
  return useQuery({ queryKey: ['users', 'detail', id], queryFn: () => usersApi.detail(id), enabled: !!id });
}

export function useUserReviews(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['users', 'reviews', id],
    queryFn: () => usersApi.reviews(id),
    enabled: enabled && !!id,
  });
}

/** One hook for every account action; invalidates the detail + list on success. */
export function useUserAction(id: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['users'] });
  };
  return {
    suspend: useMutation({ mutationFn: () => usersApi.suspend(id), onSuccess: invalidate }),
    reactivate: useMutation({ mutationFn: () => usersApi.reactivate(id), onSuccess: invalidate }),
    freeze: useMutation({ mutationFn: () => usersApi.freeze(id), onSuccess: invalidate }),
    unfreeze: useMutation({ mutationFn: () => usersApi.unfreeze(id), onSuccess: invalidate }),
    resetTwoFactor: useMutation({ mutationFn: () => usersApi.resetTwoFactor(id), onSuccess: invalidate }),
    forceLogout: useMutation({ mutationFn: () => usersApi.forceLogout(id) }),
  };
}

export function useDeleteReview(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => usersApi.deleteReview(reviewId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', 'reviews', userId] }),
  });
}
