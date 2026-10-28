import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

export interface AuditFilter {
  action?: string;
  actorId?: string;
  result?: string;
  since?: Date;
  /** Free-text; matched against action/entityType/entityId/ip and actor ids. */
  search?: string;
  searchActorIds?: string[];
}

function whereFor(filter: AuditFilter): Prisma.AuditLogWhereInput {
  const search = filter.search?.trim();
  return {
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.result ? { result: filter.result } : {}),
    ...(filter.since ? { createdAt: { gte: filter.since } } : {}),
    ...(search
      ? {
          OR: [
            { action: { contains: search, mode: 'insensitive' } },
            { entityType: { contains: search, mode: 'insensitive' } },
            { entityId: { contains: search, mode: 'insensitive' } },
            { ipAddress: { contains: search, mode: 'insensitive' } },
            ...(filter.searchActorIds && filter.searchActorIds.length > 0
              ? [{ actorId: { in: filter.searchActorIds } }]
              : []),
          ],
        }
      : {}),
  };
}

/** Reads for the admin Audit log console (SRS FR-ADM-006). */
export const AuditAdminRepository = {
  list(filter: AuditFilter, skip: number, take: number) {
    return prisma.auditLog.findMany({
      where: whereFor(filter),
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  },

  count(filter: AuditFilter) {
    return prisma.auditLog.count({ where: whereFor(filter) });
  },

  distinctActions() {
    return prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
  },

  distinctActorIds() {
    return prisma.auditLog.findMany({
      where: { actorId: { not: null } },
      distinct: ['actorId'],
      select: { actorId: true },
    });
  },

  getUsersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        fullName: true,
        email: true,
        adminRole: { select: { name: true, isSuperAdmin: true } },
      },
    });
  },

  findActorIdsBySearch(search: string) {
    return prisma.user.findMany({
      where: {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 100,
    });
  },
};
