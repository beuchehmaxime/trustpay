import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

export interface PermissionDef {
  key: string;
  group: string;
  label: string;
  description?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSuperAdmin: boolean;
  isSystem: boolean;
  operatorCount?: number;
  createdAt: string;
}

export interface Operator {
  id: string;
  fullName: string;
  email: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  role: { id: string; name: string; isSuperAdmin: boolean } | null;
}

export interface RoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export interface OperatorInput {
  fullName: string;
  email: string;
  password: string;
  roleId: string;
}

/** RBAC admin service calls. */
export const rbacApi = {
  async permissions() {
    const { data } = await api.get<PermissionDef[]>(endpoints.admin.permissions);
    return data;
  },
  async roles() {
    const { data } = await api.get<Role[]>(endpoints.admin.roles);
    return data;
  },
  async createRole(input: RoleInput) {
    const { data } = await api.post<Role>(endpoints.admin.roles, input);
    return data;
  },
  async updateRole(id: string, input: Partial<RoleInput>) {
    const { data } = await api.patch<Role>(endpoints.admin.role(id), input);
    return data;
  },
  async deleteRole(id: string) {
    await api.delete(endpoints.admin.role(id));
  },
  async operators() {
    const { data } = await api.get<Operator[]>(endpoints.admin.operators);
    return data;
  },
  async createOperator(input: OperatorInput) {
    const { data } = await api.post<Operator>(endpoints.admin.operators, input);
    return data;
  },
  async updateOperator(id: string, input: { roleId?: string; status?: 'ACTIVE' | 'SUSPENDED' }) {
    const { data } = await api.patch<Operator>(endpoints.admin.operator(id), input);
    return data;
  },
};
