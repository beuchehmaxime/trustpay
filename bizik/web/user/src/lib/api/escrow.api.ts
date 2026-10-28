import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { Contract } from '@/lib/api/contracts.api';

export type DisputeReason =
  | 'NON_DELIVERY'
  | 'INCOMPLETE_WORK'
  | 'QUALITY_BELOW_SPEC'
  | 'SCOPE_CREEP'
  | 'COMMUNICATION_BREAKDOWN'
  | 'OTHER';

/** Escrow Service calls (SRS MOD-05). Each returns the refreshed contract. */
export const escrowApi = {
  async fundMilestone(milestoneId: string, body?: Record<string, unknown>) {
    const { data } = await api.post<Contract>(endpoints.escrow.fundMilestone(milestoneId), body);
    return data;
  },
  /**
   * Pay a milestone into escrow by charging Mobile Money DIRECTLY. Asynchronous
   * by nature: the provider prompts that phone, and escrow is funded when the
   * payment confirms - so this returns a pending payment, not an updated deal.
   */
  async fundFromNumber(
    milestoneId: string,
    body: { payoutMethodId?: string; phoneNumber?: string; provider?: 'MTN_MOBILE_MONEY' | 'ORANGE_MONEY' },
  ) {
    const { data } = await api.post<{
      quote: { total: number; currency: string };
      payment: { id: string; status: string; reference: string };
    }>(endpoints.escrow.fundFromNumber(milestoneId), body);
    return data;
  },
  async releaseMilestone(milestoneId: string) {
    const { data } = await api.post<Contract>(endpoints.escrow.releaseMilestone(milestoneId));
    return data;
  },
  async disputeMilestone(
    milestoneId: string,
    body: { reason: DisputeReason; description: string; images?: string[] },
  ) {
    const { data } = await api.post<Contract>(endpoints.escrow.disputeMilestone(milestoneId), body);
    return data;
  },
};
