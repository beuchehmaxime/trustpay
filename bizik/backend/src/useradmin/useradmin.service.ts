import { User } from '@prisma/client';

import { AuthService } from '../auth/auth.service';
import { AppError } from '../lib/errors';
import { UserAdminRepository, UserListFilters } from './useradmin.repository';

function toListItem(user: User) {
  return {
    id: user.id,
    fullName: user.fullName,
    // The handle people send money to - it lives on the user, not the (unused)
    // Profile table.
    username: user.username,
    email: user.email,
    phone: user.phone,
    country: user.country,
    role: user.role.toLowerCase(),
    status: user.status,
    kycTier: user.kycTier,
    freelancerEnabled: user.freelancerEnabled,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

async function toDetail(userId: string) {
  const user = await UserAdminRepository.findById(userId);
  if (!user) throw new AppError(404, 'Q-404', 'User not found');
  const [profile, wallets] = await Promise.all([
    UserAdminRepository.profileByUserId(userId),
    UserAdminRepository.walletsByUserId(userId),
  ]);
  return {
    ...toListItem(user),
    companyName: user.companyName,
    locale: user.locale,
    phoneVerified: user.phoneVerified,
    updatedAt: user.updatedAt,
    /**
     * Where the account came from. The first question about an unexpected
     * signup is "is this a person?", and the answer lives in the client, the
     * address it arrived from and the agent string.
     */
    signup: {
      source: user.signupSource ?? null,
      ip: user.signupIp ?? null,
      userAgent: user.signupUserAgent ?? null,
    },
    profile: profile
      ? {
          username: profile.username,
          displayName: profile.displayName,
          bio: profile.bio,
          bizikScore: profile.bizikScore,
          completedContracts: profile.completedContracts,
          avgRating: Number(profile.avgRating),
          disputeRate: Number(profile.disputeRate),
        }
      : null,
    wallets: wallets.map((wallet) => ({
      currency: wallet.currency,
      balance: Number(wallet.balance),
      pendingBalance: Number(wallet.pendingBalance),
      status: wallet.status,
    })),
  };
}

/** Staff enum roles - platform operators, managed in the Operators module. */
const STAFF_ROLES = new Set<string>(['ADMIN', 'COMPLIANCE', 'MEDIATOR']);

/** A platform operator (assigned RBAC role) or a staff-role account. */
function isOperator(user: User): boolean {
  return !!user.adminRoleId || STAFF_ROLES.has(user.role);
}

/** Load an end user or 404; block acting on platform operators from this module. */
async function getEndUser(userId: string): Promise<User> {
  const user = await UserAdminRepository.findById(userId);
  if (!user) throw new AppError(404, 'Q-404', 'User not found');
  if (isOperator(user)) {
    throw new AppError(403, 'Q-403', 'Manage platform operators from the Operators section.');
  }
  return user;
}

export const UserAdminService = {
  async list(filters: UserListFilters) {
    const { items, total } = await UserAdminRepository.list(filters);
    return {
      items: items.map(toListItem),
      page: filters.page,
      pageSize: filters.pageSize,
      total,
    };
  },

  async detail(userId: string) {
    // Platform operators are not part of Users & accounts.
    const user = await UserAdminRepository.findById(userId);
    if (!user || isOperator(user)) throw new AppError(404, 'Q-404', 'User not found');
    return toDetail(userId);
  },

  /** KPI counts for the Users list header. */
  stats() {
    return UserAdminRepository.stats();
  },

  async reviews(userId: string) {
    const reviews = await UserAdminRepository.reviewsForUser(userId);
    return reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      reported: review.reported,
      reviewerId: review.reviewerId,
      contractId: review.contractId,
      createdAt: review.createdAt,
    }));
  },

  /** A user's recent projects (as creator or counterparty). */
  async recentProjects(userId: string) {
    const user = await UserAdminRepository.findById(userId);
    if (!user || isOperator(user)) throw new AppError(404, 'Q-404', 'User not found');
    const contracts = await UserAdminRepository.recentProjectsForUser(userId);
    return contracts.map((contract) => ({
      id: contract.id,
      title: contract.title,
      status: contract.status,
      amount: Number(contract.totalAmount),
      currency: contract.currency,
      isCreator: contract.creatorId === userId,
      createdAt: contract.createdAt,
    }));
  },

  // ---- Account status (users.suspend) ----
  async suspend(userId: string) {
    const user = await getEndUser(userId);
    if (user.status === 'FROZEN') {
      throw new AppError(409, 'Q-409', 'This account is frozen by compliance - unfreeze it first.');
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError(409, 'Q-409', 'This account is already suspended.');
    }
    await UserAdminRepository.updateStatus(userId, 'SUSPENDED');
    await AuthService.revokeEverything(userId); // kick out active sessions
    return toDetail(userId);
  },

  async reactivate(userId: string) {
    const user = await getEndUser(userId);
    if (user.status !== 'SUSPENDED') {
      throw new AppError(409, 'Q-409', 'This account is not suspended.');
    }
    await UserAdminRepository.updateStatus(userId, 'ACTIVE');
    return toDetail(userId);
  },

  // ---- Compliance hold (accounts.freeze) ----
  async freeze(userId: string) {
    const user = await getEndUser(userId);
    if (user.status === 'FROZEN') {
      throw new AppError(409, 'Q-409', 'This account is already frozen.');
    }
    await UserAdminRepository.updateStatus(userId, 'FROZEN');
    await AuthService.revokeEverything(userId);
    return toDetail(userId);
  },

  async unfreeze(userId: string) {
    const user = await getEndUser(userId);
    if (user.status !== 'FROZEN') {
      throw new AppError(409, 'Q-409', 'This account is not frozen.');
    }
    await UserAdminRepository.updateStatus(userId, 'ACTIVE');
    return toDetail(userId);
  },

  // ---- Security (users.manage) ----
  async resetTwoFactor(userId: string) {
    await getEndUser(userId);
    await UserAdminRepository.clearTwoFactor(userId);
    return toDetail(userId);
  },

  async forceLogout(userId: string) {
    await getEndUser(userId);
    await AuthService.revokeEverything(userId);
    return { success: true };
  },

  // ---- Reviews moderation (reviews.moderate) ----
  async deleteReview(reviewId: string) {
    const review = await UserAdminRepository.reviewById(reviewId);
    if (!review) throw new AppError(404, 'Q-404', 'Review not found');
    await UserAdminRepository.deleteReview(reviewId);
    return { success: true };
  },
};
