import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

/** Data-access for RBAC roles + platform operators. */
export const RbacRepository = {
  listRoles() {
    return prisma.adminRole.findMany({
      orderBy: [{ isSuperAdmin: 'desc' }, { createdAt: 'asc' }],
      include: { _count: { select: { operators: true } } },
    });
  },

  roleById(id: string) {
    return prisma.adminRole.findUnique({ where: { id } });
  },

  roleByName(name: string) {
    return prisma.adminRole.findUnique({ where: { name } });
  },

  createRole(data: { name: string; description?: string; permissions: string[] }) {
    return prisma.adminRole.create({ data });
  },

  updateRole(id: string, data: Prisma.AdminRoleUpdateInput) {
    return prisma.adminRole.update({ where: { id }, data });
  },

  deleteRole(id: string) {
    return prisma.adminRole.delete({ where: { id } });
  },

  countOperators(roleId: string) {
    return prisma.user.count({ where: { adminRoleId: roleId } });
  },

  // ---- Operators (users with an assigned admin role) ----
  listOperators() {
    return prisma.user.findMany({
      where: { adminRoleId: { not: null } },
      orderBy: { createdAt: 'asc' },
      include: { adminRole: true },
    });
  },

  operatorById(id: string) {
    return prisma.user.findUnique({ where: { id }, include: { adminRole: true } });
  },
};
