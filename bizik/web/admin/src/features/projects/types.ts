/** Projects & contracts types - mirrors backend ProjectsService (SRS MOD-05/06). */

export type ContractStatusValue =
  | 'DRAFT'
  | 'INVITED'
  | 'UNDER_REVIEW'
  | 'SIGNED'
  | 'FUNDED'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'DISPUTED'
  | 'COMPLETED'
  | 'CANCELLED';

export type MilestoneStatusValue =
  | 'PENDING'
  | 'FUNDED'
  | 'ACTIVE'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'RELEASED'
  | 'DISPUTED'
  | 'CANCELLED';

export interface ProjectParty {
  id: string | null;
  fullName: string;
  email: string | null;
  status: string;
}

export interface ProjectListItem {
  id: string;
  title: string;
  status: ContractStatusValue;
  statusLabel: string;
  currency: string;
  totalAmount: number;
  creator: ProjectParty | null;
  counterparty: ProjectParty | null;
  milestoneCount: number;
  milestonesReleased: number;
  createdAt: string;
  updatedAt: string;
}

export interface Deliverable {
  id: string;
  description: string;
  fileId: string | null;
}

export interface MilestoneSubmission {
  id: string;
  note: string | null;
  fileIds: string[];
  images: string[];
  createdAt: string;
}

export interface ProjectMilestone {
  id: string;
  order: number;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  status: MilestoneStatusValue;
  statusLabel: string;
  deadline: string | null;
  revisionCount: number;
  maxRevisions: number;
  submittedAt: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
  deliverables: Deliverable[];
  submissions: MilestoneSubmission[];
}

export interface EscrowTransaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface EscrowSummary {
  held: number;
  released: number;
  refunded: number;
  currency: string | null;
  status?: string;
  transactions: EscrowTransaction[];
}

export interface ProjectInvitation {
  id: string;
  email: string;
  status: string;
  createdAt: string;
}

export interface TimelineEvent {
  label: string;
  at: string;
}

export interface ProjectDetail {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  category: string | null;
  status: ContractStatusValue;
  statusLabel: string;
  currency: string;
  totalAmount: number;
  platformFees: number;
  creatorIsPayer: boolean;
  inspectionDays: number;
  creator: ProjectParty | null;
  counterparty: ProjectParty | null;
  payerSide: 'creator' | 'counterparty';
  milestones: ProjectMilestone[];
  escrow: EscrowSummary;
  amendments: number;
  invitations: ProjectInvitation[];
  signatures: number;
  timeline: TimelineEvent[];
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  completedAt: string | null;
}

export interface ProjectStats {
  total: number;
  active: number;
  disputed: number;
  completed: number;
  cancelled: number;
  draftOrInvited: number;
}

export interface ProjectFilters {
  status?: ContractStatusValue;
  currency?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ContractTemplate {
  id: string;
  name: string;
  category: string;
  isSystem: boolean;
  milestones: number;
  ownerId: string | null;
  createdAt: string;
}
