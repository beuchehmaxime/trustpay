import { AdminRole, User } from '@prisma/client';

import { AuthRepository } from '../auth/auth.repository';
import { AppError } from '../lib/errors';
import { hashPassword } from '../lib/password';
import { PERMISSIONS } from '../lib/permissions';
import { RbacRepository } from './rbac.repository';
import {
  CreateOperatorInput,
  CreateRoleInput,
  UpdateOperatorInput,
  UpdateRoleInput,
} from './rbac.validation';

type RoleWithCount = AdminRole & { _count?: { operators: number } };
type OperatorUser = User & { adminRole: AdminRole | null };

function roleDto(role: RoleWithCount) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    // Super-admin implicitly holds every permission.
    permissions: role.isSuperAdmin ? ['*'] : role.permissions,
    isSuperAdmin: role.isSuperAdmin,
    isSystem: role.isSystem,
    operatorCount: role._count?.operators,
    createdAt: role.createdAt,
  };
}

function operatorDto(operator: OperatorUser) {
  return {
    id: operator.id,
    fullName: operator.fullName,
    email: operator.email,
    status: operator.status,
    createdAt: operator.createdAt,
    lastLoginAt: operator.lastLoginAt,
    role: operator.adminRole
      ? {
          id: operator.adminRole.id,
          name: operator.adminRole.name,
          isSuperAdmin: operator.adminRole.isSuperAdmin,
        }
      : null,
  };
}

export const RbacService = {
  /** The code-defined permission catalog (for the role editor UI). */
  permissions() {
    return PERMISSIONS;
  },

  // ---- Roles ----
  async listRoles() {
    const roles = (await RbacRepository.listRoles()) as RoleWithCount[];
    return roles.map(roleDto);
  },

  async createRole(input: CreateRoleInput) {
    if (await RbacRepository.roleByName(input.name)) {
      throw new AppError(409, 'Q-409', 'A role with that name already exists.');
    }
    const role = await RbacRepository.createRole({
      name: input.name,
      description: input.description,
      permissions: input.permissions,
    });
    return roleDto(role);
  },

  async updateRole(id: string, input: UpdateRoleInput) {
    const role = await RbacRepository.roleById(id);
    if (!role) throw new AppError(404, 'Q-404', 'Role not found');
    if (role.isSuperAdmin) {
      throw new AppError(403, 'Q-403', 'The super admin role cannot be edited.');
    }
    if (input.name && input.name !== role.name && (await RbacRepository.roleByName(input.name))) {
      throw new AppError(409, 'Q-409', 'A role with that name already exists.');
    }
    const updated = await RbacRepository.updateRole(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
    });
    return roleDto(updated);
  },

  async deleteRole(id: string) {
    const role = await RbacRepository.roleById(id);
    if (!role) throw new AppError(404, 'Q-404', 'Role not found');
    if (role.isSuperAdmin || role.isSystem) {
      throw new AppError(403, 'Q-403', 'This role cannot be deleted.');
    }
    const count = await RbacRepository.countOperators(id);
    if (count > 0) {
      throw new AppError(
        409,
        'Q-409',
        `This role is assigned to ${count} operator(s). Reassign them first.`,
      );
    }
    await RbacRepository.deleteRole(id);
    return { success: true };
  },

  // ---- Operators ----
  async listOperators() {
    const ops = (await RbacRepository.listOperators()) as OperatorUser[];
    return ops.map(operatorDto);
  },

  async createOperator(input: CreateOperatorInput) {
    if (await AuthRepository.findUserByEmail(input.email)) {
      throw new AppError(409, 'Q-409', 'An account with this email already exists.');
    }
    const role = await RbacRepository.roleById(input.roleId);
    if (!role) throw new AppError(404, 'Q-404', 'Selected role not found');

    const passwordHash = await hashPassword(input.password);
    const created = await AuthRepository.createUser({
      email: input.email,
      fullName: input.fullName,
      passwordHash,
    });
    // Operators are staff: mark verified + active, tag the account as ADMIN, and
    // assign the RBAC role that actually governs what they can do.
    await AuthRepository.updateUser(created.id, {
      role: 'ADMIN',
      emailVerified: true,
      status: 'ACTIVE',
      adminRole: { connect: { id: role.id } },
    });
    const withRole = (await RbacRepository.operatorById(created.id)) as OperatorUser;
    return operatorDto(withRole);
  },

  async updateOperator(id: string, input: UpdateOperatorInput) {
    const op = (await RbacRepository.operatorById(id)) as OperatorUser | null;
    if (!op || !op.adminRoleId) throw new AppError(404, 'Q-404', 'Operator not found');

    const data: Record<string, unknown> = {};
    if (input.roleId) {
      const role = await RbacRepository.roleById(input.roleId);
      if (!role) throw new AppError(404, 'Q-404', 'Selected role not found');
      data.adminRole = { connect: { id: role.id } };
    }
    if (input.status) data.status = input.status;

    await AuthRepository.updateUser(id, data);
    const withRole = (await RbacRepository.operatorById(id)) as OperatorUser;
    return operatorDto(withRole);
  },
};
