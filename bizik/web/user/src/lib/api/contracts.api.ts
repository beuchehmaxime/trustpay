import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * Smart Contract Engine (SRS MOD-04) - the live "deals" data source.
 *
 * These types mirror the backend contract payload (the mobile app models the
 * exact same shape in `application/mobile/src/lib/mock-data.ts`). The PWA maps
 * them onto its existing demo shapes (see `src/lib/hooks/use-deals.ts`) so the
 * Deals + dashboard screens keep rendering unchanged while reading real data.
 */

/** Human contract status returned by the backend (already display-ready). */
export type ContractStatus =
  | 'Pending'
  | 'Draft'
  | 'Awaiting funding'
  | 'In progress'
  | 'In review'
  | 'Disputed'
  | 'Completed'
  | 'Cancelled';

/** Human per-milestone status returned by the backend. */
export type MilestoneStatus =
  | 'Pending'
  | 'Funded'
  | 'In progress'
  | 'Submitted'
  | 'Approved'
  | 'Released'
  | 'Disputed'
  | 'Cancelled';

export interface ContractMilestone {
  id: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  status: MilestoneStatus;
  dueDate: string;
  rawStatus?: string;
  inspectionDays?: number;
  revisionCount?: number;
  maxRevisions?: number;
  /** Hosted URLs of images the payee submitted with the delivery. */
  deliveryImages?: string[];
  /** The note the payee submitted with the delivery. */
  deliveryNote?: string | null;
  /** The latest revision feedback the payer wrote (what the payee must fix). */
  revisionNote?: string | null;
  /** ISO; set once the payee submits work. */
  submittedAt?: string | null;
  /** ISO; when funds auto-release if no action is taken. */
  autoReleaseAt?: string | null;
  /** The viewer (deal creator) may cancel this milestone - it is still unfunded. */
  canCancel?: boolean;
}

export interface Contract {
  id: string;
  title: string;
  counterparty: string;
  counterpartyCountry: string;
  amount: number;
  currency: string;
  /** Viewer's home currency, for a display-only equivalent of the amounts. */
  viewerCurrency?: string;
  /** Multiply a project-currency amount by this to show it in `viewerCurrency`. */
  fxToViewer?: number;
  status: ContractStatus;
  milestonesDone: number;
  milestonesTotal: number;
  accent?: string;
  description?: string;
  clientName: string;
  freelancerName: string;
  /** Which side the viewer is on: payer = 'client', payee = 'freelancer'. */
  viewerRole: 'client' | 'freelancer';
  createdAt?: string;
  signedByClient?: boolean;
  signedByFreelancer?: boolean;
  milestones: ContractMilestone[];
  accepted?: boolean;
  isCreator?: boolean;
  counterpartyEmail?: string | null;
  counterpartyPhone?: string | null;
  /** Shareable join+confirm link for the invitee (pending projects). */
  inviteLink?: string;
  rawStatus?: string;
  inspectionDays?: number;
  cancellationReason?: string | null;
  /** Platform fee rates (fractions, e.g. 0.035). */
  fees?: { clientServicePct: number; freelancerFeePct: number };
  /** Escrow balances for this project. */
  escrow?: { held: number; released: number; refunded: number; unfunded: number };
  /** The viewer created this deal and nothing is funded yet - they may cancel it. */
  canCancel?: boolean;
}

export interface ContractsResponse {
  mine: Contract[];
  invited: Contract[];
}

/** Payload for creating a new project (mirrors the mobile `CreateProjectInput`). */
export interface CreateProjectInput {
  title: string;
  description?: string;
  currency: string;
  /** Optional alias the creator knows the counterparty by; if omitted, their own
   *  account name is used once they join. Never the counterparty's real name. */
  counterpartyName?: string;
  /** The counterparty's phone number - how we find/invite them (required). */
  counterpartyPhone: string;
  /** true = you fund the escrow (you pay); false = the counterparty pays. */
  creatorIsPayer: boolean;
  milestones: {
    title: string;
    description?: string;
    amount: number;
    dueDate?: string;
  }[];
}

/** What a deal is waiting on, and whether the reminder actually went out. */
export interface DealReminderResult {
  sent: boolean;
  action?: 'accept' | 'fund' | 'deliver' | 'approve';
  /** The pending step is the sender's own - nobody was messaged. */
  yourMove?: boolean;
  nothingPending?: boolean;
  tooSoon?: boolean;
  waitMinutes?: number;
  recipientName?: string;
}

/** Smart Contract Engine (SRS MOD-04) - projects. Mirrors the mobile `contractsApi`. */
export const contractsApi = {
  async list() {
    const { data } = await api.get<ContractsResponse>(endpoints.contracts.list);
    return data;
  },
  async byId(id: string) {
    const { data } = await api.get<Contract>(endpoints.contracts.byId(id));
    return data;
  },
  async create(input: CreateProjectInput) {
    const { data } = await api.post<Contract>(endpoints.contracts.list, input);
    return data;
  },
  /** Counterparty confirms a project they were invited to. */
  async accept(id: string) {
    const { data } = await api.post<Contract>(endpoints.contracts.accept(id));
    return data;
  },
  /** Invitee declines a project they were invited to (cancels it). */
  async decline(id: string) {
    const { data } = await api.post<Contract>(endpoints.contracts.decline(id));
    return data;
  },
  /** Creator marks the whole project completed (locks it). */
  async complete(id: string) {
    const { data } = await api.post<Contract>(endpoints.contracts.complete(id));
    return data;
  },
  /** Creator fixes the counterparty's details (before they confirm). */
  async editCounterparty(
    id: string,
    input: { counterpartyName?: string; counterpartyPhone?: string },
  ) {
    const { data } = await api.patch<Contract>(endpoints.contracts.editCounterparty(id), input);
    return data;
  },
  /** Payee submits a deliverable for a milestone. */
  async submitWork(milestoneId: string, body: { note?: string; images?: string[] } = {}) {
    const { data } = await api.post<Contract>(endpoints.contracts.submitWork(milestoneId), body);
    return data;
  },
  /** Payer requests a revision (written feedback). */
  async requestRevision(milestoneId: string, feedback: string) {
    const { data } = await api.post<Contract>(endpoints.contracts.revise(milestoneId), { feedback });
    return data;
  },
  /**
   * Cancel a deal you created. Only the creator can, and only while no milestone
   * has been funded - after that the deal is locked (refund or dispute instead).
   */
  async cancel(id: string, reason?: string) {
    const { data } = await api.post<Contract>(endpoints.contracts.cancel(id), { reason });
    return data;
  },
  /**
   * Remind the other party about whatever this deal is waiting on. Either side
   * can send it; BiZik writes the wording from the deal's real state.
   */
  async remind(id: string) {
    const { data } = await api.post<DealReminderResult>(endpoints.contracts.remind(id));
    return data;
  },
  /**
   * A short-lived token for this deal's PDF record. The document is opened by
   * URL in a new tab, which cannot send an auth header.
   */
  async receiptToken(id: string) {
    const { data } = await api.get<{ token: string }>(endpoints.contracts.receiptToken(id));
    return data.token;
  },
  /** Cancel one unfunded milestone of a deal you created (the rest stays). */
  async cancelMilestone(milestoneId: string) {
    const { data } = await api.post<Contract>(endpoints.contracts.cancelMilestone(milestoneId));
    return data;
  },
  /** Add a milestone to an existing project. */
  async addMilestone(
    contractId: string,
    input: { title: string; description?: string; amount: number; dueDate?: string },
  ) {
    const { data } = await api.post<Contract>(endpoints.contracts.addMilestone(contractId), input);
    return data;
  },
  /** Edit an unfunded (PENDING) milestone. */
  async editMilestone(
    milestoneId: string,
    input: { title?: string; description?: string; amount?: number; dueDate?: string },
  ) {
    const { data } = await api.patch<Contract>(endpoints.contracts.editMilestone(milestoneId), input);
    return data;
  },
  /** Delete an unfunded (PENDING) milestone. */
  async deleteMilestone(milestoneId: string) {
    const { data } = await api.delete<Contract>(endpoints.contracts.deleteMilestone(milestoneId));
    return data;
  },
  /** Permanently delete a project (only before any money is deposited). */
  async deleteProject(id: string) {
    const { data } = await api.delete<{ deleted: boolean; id: string }>(endpoints.contracts.byId(id));
    return data;
  },
};
