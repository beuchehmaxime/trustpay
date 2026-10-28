import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * Dispute Service (SRS MOD-07) - the live "disputes" data source.
 *
 * These types mirror the backend dispute payload (the mobile app models the
 * exact same shape in `application/mobile/src/features/disputes/disputes.api.ts`).
 * The PWA maps them onto its existing disputes screens (see the disputes list +
 * detail routes) so the design keeps rendering unchanged while reading real data.
 */

export type DisputeRuling = 'FULL_RELEASE' | 'FULL_REFUND' | 'PARTIAL_SPLIT';

/** Raw dispute status returned by the backend. */
export type DisputeStatus =
  | 'FILED'
  | 'AWAITING_RESPONSE'
  | 'UNDER_REVIEW'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'AUTO_RULED';

export interface DisputeListItem {
  id: string;
  status: DisputeStatus;
  statusLabel: string;
  reason: string;
  reasonLabel: string;
  contractId: string;
  contractTitle: string;
  milestoneTitle: string;
  amount: number;
  currency: string;
  viewerRole: 'payer' | 'payee';
  filedByYou: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface DisputeMessage {
  id: string;
  body: string;
  mine: boolean;
  senderName: string;
  createdAt: string;
}

export interface DisputeEvidence {
  id: string;
  by: string;
  mine: boolean;
  description?: string | null;
  images: string[];
  createdAt: string;
}

export interface DisputeDetail extends DisputeListItem {
  description: string;
  milestoneId: string;
  filedByName: string;
  payerName: string;
  payeeName: string;
  messages: DisputeMessage[];
  timeline: { event: string; createdAt: string }[];
  ruling: {
    ruling: DisputeRuling;
    freelancerPct: number;
    clientPct: number;
    rationale: string;
    ruledAt: string;
  } | null;
  aiRecommendation: {
    ruling: DisputeRuling;
    freelancerPct: number;
    confidence: number;
    rationale: string;
  } | null;
  evidence: DisputeEvidence[];
  canMessage: boolean;
  canRelease: boolean;
  canRefund: boolean;
  canSplit: boolean;
  canWithdraw: boolean;
  canAddEvidence: boolean;
}

export const disputesApi = {
  async list() {
    const { data } = await api.get<DisputeListItem[]>(endpoints.disputes.list);
    return data;
  },
  async byId(id: string) {
    const { data } = await api.get<DisputeDetail>(endpoints.disputes.byId(id));
    return data;
  },
  async message(id: string, body: string) {
    const { data } = await api.post<DisputeDetail>(endpoints.disputes.messages(id), { body });
    return data;
  },
  async addEvidence(id: string, input: { images: string[]; description?: string }) {
    const { data } = await api.post<DisputeDetail>(endpoints.disputes.evidence(id), input);
    return data;
  },
  async withdraw(id: string) {
    const { data } = await api.post<DisputeDetail>(endpoints.disputes.withdraw(id));
    return data;
  },
};
