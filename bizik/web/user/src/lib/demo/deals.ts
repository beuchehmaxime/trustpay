/**
 * Representative deals for the Deals list + detail pages (persona: Ada Okafor).
 * Each deal carries a rich detail (parties, milestones, financials) so the
 * detail route renders without a second lookup. Swap for a live deals hook when
 * that API is wired.
 */

export type DealStatus =
  | 'in_progress'
  | 'awaiting_funding'
  | 'in_review'
  | 'pending'
  | 'disputed'
  | 'completed'
  | 'cancelled';

export type AvatarTone = 'brand' | 'warning' | 'positive' | 'neutral';
export type ProgressTone = 'brand' | 'warning' | 'cyan';

export interface DealListItem {
  id: string;
  title: string;
  /** Who set up the deal: 'created' (you did) drives "My deals", 'invited' drives "Invited". */
  origin: 'created' | 'invited';
  relKey: 'to' | 'from' | 'invitedBy';
  partyName: string;
  partyMeta?: string; // literal (e.g. "Accra, GH")
  partyMetaKey?: string; // i18n key (e.g. "deals.meta.singlePayment")
  initials: string;
  avatarTone: AvatarTone;
  escrowValue: number;
  escrowCurrency: string;
  approx?: string;
  done: number;
  total: number;
  progressTone: ProgressTone;
  status: DealStatus;
  nextStepKey?: string;
  nextStepParams?: Record<string, string>;
  nextStepMuted?: boolean;
  isInvite?: boolean;
  /** Payee first name for the "≈ … for {name}" line (mobile card). */
  payeeName?: string;
  /** Shown instead of the milestone count on the mobile card (e.g. awaiting funding). */
  due?: string;
}

export const deals: DealListItem[] = [
  {
    id: 'DL-4021',
    title: 'Brand identity & packaging',
    origin: 'created',
    relKey: 'to',
    partyName: 'Kwame Mensah',
    partyMeta: 'Accra, GH',
    initials: 'KM',
    avatarTone: 'brand',
    escrowValue: 1_200_000,
    escrowCurrency: 'NGN',
    approx: '≈ GHS 9,840',
    done: 2,
    total: 4,
    progressTone: 'brand',
    status: 'in_progress',
    nextStepKey: 'deals.next.approveMilestone',
    nextStepParams: { n: '3' },
    payeeName: 'Kwame',
  },
  {
    id: 'DL-4022',
    title: '200 solar lamps - bulk order',
    origin: 'created',
    relKey: 'to',
    partyName: 'Li Wei',
    partyMetaKey: 'deals.meta.singlePayment',
    initials: 'LW',
    avatarTone: 'warning',
    escrowValue: 750_000,
    escrowCurrency: 'NGN',
    approx: '≈ $486.00',
    done: 0,
    total: 1,
    progressTone: 'warning',
    status: 'awaiting_funding',
    nextStepKey: 'deals.next.fundEscrow',
    payeeName: 'Li Wei',
    due: '22 Aug',
  },
  {
    id: 'DL-4023',
    title: 'Office fit-out photography',
    origin: 'invited',
    relKey: 'from',
    partyName: 'Amina Bello',
    partyMetaKey: 'deals.meta.youGetPaid',
    initials: 'AB',
    avatarTone: 'positive',
    escrowValue: 180_000,
    escrowCurrency: 'NGN',
    done: 1,
    total: 1,
    progressTone: 'cyan',
    status: 'in_review',
    nextStepKey: 'deals.next.waitingApproval',
    nextStepMuted: true,
  },
  {
    id: 'DL-4024',
    title: 'Logo animation',
    origin: 'invited',
    relKey: 'invitedBy',
    partyName: 'Tunde Adeyemi',
    initials: 'TA',
    avatarTone: 'neutral',
    escrowValue: 95_000,
    escrowCurrency: 'NGN',
    done: 0,
    total: 0,
    progressTone: 'brand',
    status: 'pending',
    isInvite: true,
  },
];

// ---- Deal detail ---------------------------------------------------------

export type MilestoneStatus = 'released' | 'submitted' | 'pending' | 'funded' | 'approved';

export interface DealParty {
  name: string;
  initials: string;
  tone: AvatarTone;
  roleKey: string; // deals.detail.whoPays | whoGetsPaid
  currency: string;
  /** Whether this party is the one getting paid (drives the "Payee/Payer" label). */
  isPayee?: boolean;
  location?: string;
}

export interface MilestoneAttachment {
  kind: 'image' | 'pdf';
  label?: string;
  size?: string;
}

export interface Milestone {
  index: number;
  title: string;
  amount: number;
  currency: string;
  deliveryDate: string;
  status: MilestoneStatus;
  current?: boolean;
  delivery?: {
    revision: string;
    note: string;
    attachments: MilestoneAttachment[];
  };
}

export interface DealDetail {
  id: string;
  title: string;
  status: DealStatus;
  total: number;
  currency: string;
  approx?: string;
  payer: DealParty;
  payee: DealParty;
  signedBoth: boolean;
  scope: string;
  milestones: Milestone[];
  autoReleaseIn?: string;
  releaseAmount?: number;
  releaseApprox?: string;
  releaseMilestoneIndex?: number;
  viewerRole: 'payer' | 'payee';
  financials: { released: number; inEscrow: number; requiredDate: string; fee: number };
}

const ADA: DealParty = { name: 'Ada Okafor', initials: 'AO', tone: 'brand', roleKey: 'deals.detail.whoPays', currency: 'NGN' };

export const dealDetails: Record<string, DealDetail> = {
  'DL-4021': {
    id: 'DL-4021',
    title: 'Brand identity & packaging',
    status: 'in_progress',
    total: 1_200_000,
    currency: 'NGN',
    approx: '≈ GHS 9,840.00',
    payer: ADA,
    payee: { name: 'Kwame Mensah', initials: 'KM', tone: 'positive', roleKey: 'deals.detail.whoGetsPaid', currency: 'GHS', isPayee: true, location: 'Accra, GH' },
    signedBoth: true,
    scope:
      'Full brand identity for Kora Coffee: logotype, colour system, two packaging SKUs, and a one-page brand guide. Source files in Figma and print-ready PDFs. Two revision rounds per milestone.',
    milestones: [
      { index: 1, title: 'Discovery & moodboard', amount: 300_000, currency: 'NGN', deliveryDate: '12 Jun', status: 'released' },
      { index: 2, title: 'Logotype & colour', amount: 300_000, currency: 'NGN', deliveryDate: '04 Jul', status: 'released' },
      {
        index: 3,
        title: 'Packaging - 2 SKUs',
        amount: 300_000,
        currency: 'NGN',
        deliveryDate: '08 Aug',
        status: 'submitted',
        current: true,
        delivery: {
          revision: '1/2',
          note: 'Both SKUs done - dieline PDFs and 3D mockups attached. Colour swapped to the warmer brown you asked for.',
          attachments: [{ kind: 'image' }, { kind: 'image' }, { kind: 'pdf', label: 'PDF', size: '2.4MB' }],
        },
      },
      { index: 4, title: 'Brand guide PDF', amount: 300_000, currency: 'NGN', deliveryDate: '29 Aug', status: 'pending' },
    ],
    autoReleaseIn: '2 days 14 h',
    releaseAmount: 300_000,
    releaseApprox: '≈ GHS 2,460.00',
    releaseMilestoneIndex: 3,
    viewerRole: 'payer',
    financials: { released: 600_000, inEscrow: 600_000, requiredDate: '29 Aug 2026', fee: 18_000 },
  },
  'DL-4022': {
    id: 'DL-4022',
    title: '200 solar lamps - bulk order',
    status: 'awaiting_funding',
    total: 750_000,
    currency: 'NGN',
    approx: '≈ $486.00',
    payer: ADA,
    payee: { name: 'Li Wei', initials: 'LW', tone: 'warning', roleKey: 'deals.detail.whoGetsPaid', currency: 'USD' },
    signedBoth: true,
    scope:
      'Supply and delivery of 200 solar lamps - bulk order. Single payment released on delivery confirmation. Twelve-month manufacturer warranty.',
    milestones: [
      { index: 1, title: 'Delivery of 200 lamps', amount: 750_000, currency: 'NGN', deliveryDate: '20 Aug', status: 'pending', current: true },
    ],
    viewerRole: 'payer',
    financials: { released: 0, inEscrow: 0, requiredDate: '20 Aug 2026', fee: 11_250 },
  },
  'DL-4023': {
    id: 'DL-4023',
    title: 'Office fit-out photography',
    status: 'in_review',
    total: 180_000,
    currency: 'NGN',
    payer: { name: 'Amina Bello', initials: 'AB', tone: 'positive', roleKey: 'deals.detail.whoPays', currency: 'NGN' },
    payee: { name: 'Ada Okafor', initials: 'AO', tone: 'brand', roleKey: 'deals.detail.whoGetsPaid', currency: 'NGN' },
    signedBoth: true,
    scope:
      'Full-day photography of the finished office fit-out. Edited gallery of 40 images delivered as high-resolution JPEGs with usage rights.',
    milestones: [
      { index: 1, title: 'Full gallery delivery', amount: 180_000, currency: 'NGN', deliveryDate: '06 Aug', status: 'submitted', current: true,
        delivery: { revision: '1/1', note: 'Final edited gallery uploaded - 40 images, colour-graded and retouched.', attachments: [{ kind: 'image' }, { kind: 'image' }] } },
    ],
    autoReleaseIn: '4 days 6 h',
    viewerRole: 'payee',
    financials: { released: 0, inEscrow: 180_000, requiredDate: '06 Aug 2026', fee: 2_700 },
  },
  'DL-4024': {
    id: 'DL-4024',
    title: 'Logo animation',
    status: 'pending',
    total: 95_000,
    currency: 'NGN',
    payer: { name: 'Tunde Adeyemi', initials: 'TA', tone: 'neutral', roleKey: 'deals.detail.whoPays', currency: 'NGN' },
    payee: { name: 'Ada Okafor', initials: 'AO', tone: 'brand', roleKey: 'deals.detail.whoGetsPaid', currency: 'NGN' },
    signedBoth: false,
    scope: 'Short logo animation (5-second intro sting) for social use. One revision round included. Delivered as MP4 and transparent MOV.',
    milestones: [
      { index: 1, title: 'Animation delivery', amount: 95_000, currency: 'NGN', deliveryDate: '15 Aug', status: 'pending' },
    ],
    viewerRole: 'payee',
    financials: { released: 0, inEscrow: 0, requiredDate: '15 Aug 2026', fee: 1_425 },
  },
};

/** Period KPIs for the Deals header. */
export const dealsSummary = {
  currency: 'NGN',
  active: deals.filter((deal) => ['in_progress', 'awaiting_funding', 'in_review'].includes(deal.status)).length,
  heldInEscrow: 1_950_000,
  invited: deals.filter((deal) => deal.isInvite).length,
};
