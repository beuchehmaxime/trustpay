import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  rbacApi,
  type OperatorInput,
  type RoleInput,
} from './rbac.api';

export function usePermissionCatalog() {
  return useQuery({ queryKey: ['rbac', 'permissions'], queryFn: rbacApi.permissions, staleTime: 300_000 });
}

export function useRoles() {
  return useQuery({ queryKey: ['rbac', 'roles'], queryFn: rbacApi.roles });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RoleInput) => rbacApi.createRole(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbac', 'roles'] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<RoleInput> }) =>
      rbacApi.updateRole(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbac', 'roles'] }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rbacApi.deleteRole(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbac', 'roles'] }),
  });
}

export function useOperators() {
  return useQuery({ queryKey: ['rbac', 'operators'], queryFn: rbacApi.operators });
}

export function useCreateOperator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OperatorInput) => rbacApi.createOperator(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbac', 'operators'] }),
  });
}

export function useUpdateOperator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { roleId?: string; status?: 'ACTIVE' | 'SUSPENDED' } }) =>
      rbacApi.updateOperator(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbac', 'operators'] }),
  });
}
