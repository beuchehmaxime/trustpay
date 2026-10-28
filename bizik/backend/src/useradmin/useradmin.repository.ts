import { Prisma, UserRole, UserStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';

export type UserSortField = 'createdAt' | 'fullName' | 'lastLoginAt' | 'kycTier' | 'status';
export type SortDirection = 'asc' | 'desc';

export interface UserListFilters {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  kycTier?: number;
  country?: string;
  sortBy?: UserSortField;
  sortDir?: SortDirection;
  page: number;
  pageSize: number;
}

/** Real end-user account types. Staff roles (ADMIN/COMPLIANCE/MEDIATOR) are
 *  platform operators and belong in the Operators module, not here. */
const END_USER_ROLES: UserRole[] = ['CLIENT', 'FREELANCER', 'AGENCY'];

/** Base filter that scopes every query to end-user accounts. */
const endUserScope: Prisma.UserWhereInput = { adminRoleId: null, role: { in: END_USER_ROLES } };

/** Data-access for the admin Users & accounts module (end users only). */
export const UserAdminRepository = {
  async list(filters: UserListFilters) {
    const where: Prisma.UserWhereInput = {
      // Exclude platform operators from Users & accounts, by BOTH signals:
      //  • no assigned RBAC role, and
      //  • an end-user role (not a staff enum role) - this also filters out
      //    legacy admin accounts created before RBAC.
      adminRoleId: null,
      role: filters.role ?? { in: END_USER_ROLES },
      ...(filters.search
        ? {
            OR: [
              { fullName: { contains: filters.search, mode: 'insensitive' } },
              { email: { contains: filters.search, mode: 'insensitive' } },
              { phone: { contains: filters.search, mode: 'insensitive' } },
              { country: { contains: filters.search, mode: 'insensitive' } },
              { username: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.kycTier !== undefined ? { kycTier: filters.kycTier } : {}),
      ...(filters.country ? { country: filters.country } : {}),
    };

    const sortField = filters.sortBy ?? 'createdAt';
    const sortDirection = filters.sortDir ?? 'desc';
    const orderBy = { [sortField]: sortDirection } as Prisma.UserOrderByWithRelationInput;

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  },

  /** Aggregate counts for the KPI cards on the Users list. */
  async stats() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [total, active, suspended, frozen, pending, clients, freelancers, agencies, verified, newLast30Days] =
      await Promise.all([
        prisma.user.count({ where: endUserScope }),
        prisma.user.count({ where: { ...endUserScope, status: 'ACTIVE' } }),
        prisma.user.count({ where: { ...endUserScope, status: 'SUSPENDED' } }),
        prisma.user.count({ where: { ...endUserScope, status: 'FROZEN' } }),
        prisma.user.count({ where: { ...endUserScope, status: 'PENDING' } }),
        prisma.user.count({ where: { ...endUserScope, role: 'CLIENT' } }),
        prisma.user.count({ where: { ...endUserScope, role: 'FREELANCER' } }),
        prisma.user.count({ where: { ...endUserScope, role: 'AGENCY' } }),
        prisma.user.count({ where: { ...endUserScope, kycTier: { gte: 2 } } }),
        prisma.user.count({ where: { ...endUserScope, createdAt: { gte: thirtyDaysAgo } } }),
      ]);
    return {
      total,
      active,
      suspended,
      frozen,
      pending,
      clients,
      freelancers,
      agencies,
      verified,
      newLast30Days,
    };
  },

  /** A user's most recent projects (as creator or counterparty). */
  recentProjectsForUser(userId: string) {
    return prisma.contract.findMany({
      where: { OR: [{ creatorId: userId }, { counterpartyId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  profileByUserId(userId: string) {
    return prisma.profile.findUnique({ where: { userId } });
  },

  walletsByUserId(userId: string) {
    return prisma.wallet.findMany({ where: { userId }, orderBy: { currency: 'asc' } });
  },

  reviewsForUser(userId: string) {
    return prisma.review.findMany({
      where: { revieweeId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  reviewById(id: string) {
    return prisma.review.findUnique({ where: { id } });
  },

  deleteReview(id: string) {
    return prisma.review.delete({ where: { id } });
  },

  updateStatus(id: string, status: UserStatus) {
    return prisma.user.update({ where: { id }, data: { status } });
  },

  /** Remove all 2FA factors + backup codes and clear the flag (admin reset). */
  clearTwoFactor(userId: string) {
    return prisma.$transaction([
      prisma.twoFactorMethod.deleteMany({ where: { userId } }),
      prisma.backupCode.deleteMany({ where: { userId } }),
      prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } }),
    ]);
  },
};
