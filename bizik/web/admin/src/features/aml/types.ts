/** AML / sanctions types - mirrors the backend AmlService DTOs (SRS MOD-10). */

export type AmlAlertStatusValue = 'NEW' | 'UNDER_REVIEW' | 'CLEARED' | 'ESCALATED';

export type AmlAlertTypeValue =
  | 'STRUCTURING'
  | 'SANCTIONS_MATCH'
  | 'HIGH_RISK_FLOW'
  | 'VELOCITY_ANOMALY'
  | 'PEP_MATCH';

export interface AmlAlertUser {
  fullName: string;
  email: string;
  country: string | null;
  role: string;
  status: string;
  kycTier: number;
}

export interface AmlAlert {
  id: string;
  reference: string;
  type: AmlAlertTypeValue;
  typeLabel: string;
  status: AmlAlertStatusValue;
  statusLabel: string;
  riskScore: number;
  whyTriggered: string;
  userId: string | null;
  transactionRef: string | null;
  assignedToId: string | null;
  details: unknown;
  user: AmlAlertUser | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AmlTimelineEvent {
  id: string;
  kind: 'event' | 'note';
  label: string;
  at: string;
}

export interface AmlScreening {
  id: string;
  provider: string;
  result: 'CLEAR' | 'MATCH' | 'PEP';
  matchData: unknown;
  screenedAt: string;
}

export interface AmlAlertDetail extends AmlAlert {
  screenings: AmlScreening[];
}

export interface AmlStats {
  total: number;
  open: number;
  new: number;
  underReview: number;
  escalated: number;
  cleared: number;
}

export interface AmlFilters {
  status?: AmlAlertStatusValue;
  type?: AmlAlertTypeValue;
  search?: string;
}
