import { api } from '@/lib/api/client';

export interface DormantCandidate {
  userId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  reason: 'NEVER_VERIFIED' | 'NEVER_ACTIVE';
  createdAt: string;
  /** The day this account becomes eligible for deletion. */
  scheduledFor: string;
  /** How many of the three warnings have been delivered. */
  noticesSent: number;
  /** Fully warned AND past its date - the only ones that can be deleted. */
  eligible: boolean;
}

export interface DormancyReview {
  rules: { unverifiedDays: number; inactiveDays: number; notices: number[] };
  /** False means no warnings are being sent, so nothing can become eligible. */
  warningsEnabled: boolean;
  candidates: DormantCandidate[];
  eligibleCount: number;
}

export interface PurgeResult {
  deleted: number;
  refused: number;
  results: { userId: string; name: string; deleted: boolean; reason?: string }[];
}

export const dormancyApi = {
  async review() {
    const { data } = await api.get<DormancyReview>('/admin/dormant-accounts');
    return data;
  },
  /**
   * Delete the selected accounts. The password is the operator's own, re-entered
   * at the moment of the action - `accounts.purge` is the only permission in the
   * console that destroys data, and an unattended session is the realistic way
   * it gets misused.
   */
  async purge(userIds: string[], password: string) {
    const { data } = await api.post<PurgeResult>('/admin/dormant-accounts/purge', {
      userIds,
      password,
    });
    return data;
  },
};
