import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'FROZEN' | 'CLOSED';

export interface UserListItem {
  id: string;
  fullName: string;
  username: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  role: string;
  status: UserStatus;
  kycTier: number;
  freelancerEnabled: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserProfile {
  username: string;
  displayName: string;
  bio: string | null;
  bizikScore: number;
  completedContracts: number;
  avgRating: number;
  disputeRate: number;
}

export interface WalletBalance {
  currency: string;
  balance: number;
  pendingBalance: number;
  status: string;
}

export interface UserDetail extends UserListItem {
  companyName: string | null;
  locale: string;
  phoneVerified: boolean;
  updatedAt: string;
  /**
   * Where the account was created from. The first question about an unexpected
   * signup is whether a person made it, and the client, address and agent string
   * are what answer that. Null on accounts created before this was recorded.
   */
  signup: {
    source: string | null;
    ip: string | null;
    userAgent: string | null;
  };
  profile: UserProfile | null;
  wallets: WalletBalance[];
}

export interface UserReview {
  id: string;
  rating: number;
  comment: string | null;
  reported: boolean;
  reviewerId: string;
  contractId: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UserStats {
  total: number;
  active: number;
  suspended: number;
  frozen: number;
  pending: number;
  clients: number;
  freelancers: number;
  agencies: number;
  verified: number;
  newLast30Days: number;
}

export interface UserProject {
  id: string;
  title: string;
  status: string;
  amount: number;
  currency: string;
  isCreator: boolean;
  createdAt: string;
}

export interface UserFilters {
  search?: string;
  role?: string;
  status?: string;
  kycTier?: number;
  country?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export const usersApi = {
  async list(filters: UserFilters) {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
    );
    const { data } = await api.get<Paginated<UserListItem>>(endpoints.admin.users, { params });
    return data;
  },
  async stats() {
    const { data } = await api.get<UserStats>(endpoints.admin.userStats);
    return data;
  },
  async detail(id: string) {
    const { data } = await api.get<UserDetail>(endpoints.admin.user(id));
    return data;
  },
  async projects(id: string) {
    const { data } = await api.get<UserProject[]>(endpoints.admin.userProjects(id));
    return data;
  },
  async reviews(id: string) {
    const { data } = await api.get<UserReview[]>(endpoints.admin.userReviews(id));
    return data;
  },
  async suspend(id: string) {
    const { data } = await api.post<UserDetail>(endpoints.admin.userSuspend(id));
    return data;
  },
  async reactivate(id: string) {
    const { data } = await api.post<UserDetail>(endpoints.admin.userReactivate(id));
    return data;
  },
  async freeze(id: string) {
    const { data } = await api.post<UserDetail>(endpoints.admin.userFreeze(id));
    return data;
  },
  async unfreeze(id: string) {
    const { data } = await api.post<UserDetail>(endpoints.admin.userUnfreeze(id));
    return data;
  },
  async resetTwoFactor(id: string) {
    const { data } = await api.post<UserDetail>(endpoints.admin.userReset2fa(id));
    return data;
  },
  async forceLogout(id: string) {
    await api.post(endpoints.admin.userForceLogout(id));
  },
  async deleteReview(id: string) {
    await api.delete(endpoints.admin.review(id));
  },
};
