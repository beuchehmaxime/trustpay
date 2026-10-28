/** Disputes types - mirrors backend DisputeAdminService (SRS MOD-11). */

export type DisputeStatusValue =
  | 'FILED'
  | 'AWAITING_RESPONSE'
  | 'UNDER_REVIEW'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'AUTO_RULED';

export type RulingType = 'FULL_RELEASE' | 'FULL_REFUND' | 'PARTIAL_SPLIT';

export interface DisputeListItem {
  id: string;
  status: DisputeStatusValue;
  statusLabel: string;
  reason: string;
  reasonLabel: string;
  contractId: string;
  contractTitle: string;
  milestoneTitle: string;
  amount: number;
  currency: string;
  mediatorName: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface DisputeEvidence {
  id: string;
  by: string;
  byRole: 'payer' | 'payee';
  description: string | null;
  files: number;
  images: string[];
  createdAt: string;
}

export type PartyRole = 'payer' | 'payee' | 'mediator';

export interface DisputeResponse {
  id: string;
  by: string;
  byRole: PartyRole;
  rebuttal: string;
  createdAt: string;
}

export interface DisputeMessage {
  id: string;
  by: string;
  byRole: PartyRole;
  body: string;
  createdAt: string;
}

export interface DisputeTimelineEvent {
  event: string;
  createdAt: string;
}

export interface DisputeRuling {
  ruling: RulingType;
  freelancerPct: number;
  clientPct: number;
  rationale: string;
  ruledAt: string;
}

export interface DisputeSuggestion {
  ruling: RulingType;
  freelancerPct: number;
  confidence: number;
  rationale: string;
  source: 'heuristic' | 'model';
}

export interface DisputeDetail {
  id: string;
  status: DisputeStatusValue;
  statusLabel: string;
  reason: string;
  reasonLabel: string;
  description: string;
  contractId: string;
  contractTitle: string;
  milestoneId: string;
  milestoneTitle: string;
  amount: number;
  currency: string;
  escrowStatus: string | null;
  open: boolean;
  filedByName: string;
  filedByRole: 'payer' | 'payee';
  payerName: string;
  payeeName: string;
  responseDeadline: string;
  createdAt: string;
  resolvedAt: string | null;
  mediator: { id: string; name: string } | null;
  evidence: DisputeEvidence[];
  responses: DisputeResponse[];
  messages: DisputeMessage[];
  timeline: DisputeTimelineEvent[];
  ruling: DisputeRuling | null;
  suggestion: DisputeSuggestion;
}

export interface DisputeStats {
  total: number;
  open: number;
  escalated: number;
  resolved: number;
}

export interface Mediator {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DisputeFilters {
  status?: DisputeStatusValue;
  page?: number;
  pageSize?: number;
}

export interface RuleInput {
  ruling: RulingType;
  freelancerPct?: number;
  rationale: string;
}
