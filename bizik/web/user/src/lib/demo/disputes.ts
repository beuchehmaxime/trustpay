/**
 * Representative disputes for the Disputes list + detail (persona: Ada Okafor).
 * Each dispute carries its message thread and deal summary so the detail route
 * renders without a second lookup. Swap for a live disputes hook when wired.
 */

export type DisputeStatus = 'under_review' | 'resolved' | 'open';

export interface DisputeListItem {
  id: string; // 'D-2041'
  milestoneTitle: string;
  filedByYou: boolean;
  filedAgo: string;
  dealName: string;
  counterparty: string;
  amount: number;
  currency: string;
  status: DisputeStatus;
  nextStepKey?: string;
  /** Rich next-step banner on the mobile card (under review). */
  nextText?: string;
  deadline?: string;
  outcome?: string;
}

export const disputes: DisputeListItem[] = [
  {
    id: 'D-2041',
    milestoneTitle: 'Milestone 3 · Packaging - 2 SKUs',
    filedByYou: true,
    filedAgo: '4 days ago',
    dealName: 'Brand identity & packaging',
    counterparty: 'Kwame Mensah',
    amount: 300_000,
    currency: 'NGN',
    status: 'under_review',
    nextStepKey: 'disputes.next.addEvidence',
    nextText: 'upload the signed scope',
    deadline: 'Fri 14 Aug',
  },
  {
    id: 'D-2018',
    milestoneTitle: 'Milestone 1 · Site survey',
    filedByYou: false,
    filedAgo: '2 months ago',
    dealName: 'Warehouse retrofit',
    counterparty: 'Chidi Nwosu',
    amount: 150_000,
    currency: 'NGN',
    status: 'resolved',
    outcome: '₦75,000 refunded, ₦225,000 released.',
  },
];

// ---- Dispute detail ------------------------------------------------------

export type DisputeAuthor = 'you' | 'counterparty' | 'mediator';

export interface DisputeAttachment {
  kind: 'image' | 'pdf';
  label?: string;
}

export interface DisputeMessage {
  author: DisputeAuthor;
  name: string;
  initials: string;
  time: string;
  text: string;
  attachments?: DisputeAttachment[];
}

export interface DisputeDetail {
  id: string;
  status: DisputeStatus;
  milestoneTitle: string;
  messages: DisputeMessage[];
  summary: {
    disputedAmount: number;
    currency: string;
    dealName: string;
    dealId?: string;
    counterparty: string;
    filedByYou: boolean;
    filedDate: string;
  };
  nextStep?: { text: string; deadline: string };
  outcome?: string;
}

export const disputeDetails: Record<string, DisputeDetail> = {
  'D-2041': {
    id: 'D-2041',
    status: 'under_review',
    milestoneTitle: 'Milestone 3 · Packaging - 2 SKUs',
    messages: [
      {
        author: 'you',
        name: 'You',
        initials: 'AO',
        time: '1 Aug · 10:12',
        text: 'The dieline is for a 250 g box - the deal specifies 500 g. Attaching the signed scope and the delivered file for comparison.',
        attachments: [{ kind: 'image' }, { kind: 'pdf', label: 'PDF' }],
      },
      {
        author: 'counterparty',
        name: 'Kwame Mensah',
        initials: 'KM',
        time: '1 Aug · 15:40',
        text: 'The 500 g box was added after we signed. I delivered what the scope described and can produce the second size as a new milestone.',
      },
      {
        author: 'mediator',
        name: 'BiZik mediator',
        initials: 'Q',
        time: '2 Aug · 09:05',
        text: 'We have both submissions. Please upload the signed scope page that mentions 500 g by Fri 14 Aug. Funds stay in escrow until we decide.',
      },
    ],
    summary: {
      disputedAmount: 300_000,
      currency: 'NGN',
      dealName: 'Brand identity & packaging',
      dealId: 'DL-4021',
      counterparty: 'Kwame Mensah',
      filedByYou: true,
      filedDate: '1 Aug 2026',
    },
    nextStep: { text: 'upload the signed scope', deadline: 'Fri 14 Aug' },
  },
  'D-2018': {
    id: 'D-2018',
    status: 'resolved',
    milestoneTitle: 'Milestone 1 · Site survey',
    messages: [
      {
        author: 'counterparty',
        name: 'Chidi Nwosu',
        initials: 'CN',
        time: '2 Jun · 14:20',
        text: 'The survey report is missing two of the four zones we agreed on. Requesting a partial refund.',
      },
      {
        author: 'you',
        name: 'You',
        initials: 'AO',
        time: '2 Jun · 16:02',
        text: 'Zones C and D were out of scope in the signed brief. Happy to add them as a follow-up milestone.',
      },
      {
        author: 'mediator',
        name: 'BiZik mediator',
        initials: 'Q',
        time: '5 Jun · 11:30',
        text: 'Reviewed both submissions and the signed brief. Splitting the milestone: a partial refund to Chidi and the remainder released to you.',
      },
    ],
    summary: {
      disputedAmount: 150_000,
      currency: 'NGN',
      dealName: 'Warehouse retrofit',
      counterparty: 'Chidi Nwosu',
      filedByYou: false,
      filedDate: '2 Jun 2026',
    },
    outcome: '₦75,000 refunded, ₦225,000 released.',
  },
};

export const openDisputeCount = disputes.filter((dispute) => dispute.status !== 'resolved').length;
