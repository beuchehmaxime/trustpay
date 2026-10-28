/**
 * Representative data from the design handoff (persona: **Ada Okafor**, Lagos NG).
 * The handoff specifies exact figures/copy; this recreates them faithfully.
 *
 * TODO: replace with live React Query hooks once the web app's wallet / deals /
 * notifications API layers are built (mobile already has them).
 */
import type { StatusTone } from '@/components/ui/status-pill';

export const persona = {
  fullName: 'Ada Okafor',
  homeCurrency: 'NGN',
  walletBalance: 4_820_500,
  walletBalanceUsd: 3_120.45,
  inEscrow: 1_950_000,
  inEscrowDeals: 3,
  dealsDone: 12,
  activeDeals: 3,
  dealsNeedingAction: 2,
  completedOnTimePct: 100,
  openDisputes: 1,
  unreadActivity: 3,
} as const;

export interface AttentionCard {
  id: string;
  statusLabel: string;
  tone: StatusTone;
  title: string;
  meta: string;
  nextStep: string;
  cta: string;
  ctaTone: 'brand' | 'positive' | 'danger';
}

/** The three "Needs your attention" cards (handoff §Dashboard). */
export const attentionCards: AttentionCard[] = [
  {
    id: 'a-fund',
    statusLabel: 'Awaiting funding',
    tone: 'warning',
    title: '200 solar lamps - bulk order',
    meta: 'to Li Wei · ₦750,000.00',
    nextStep: 'Next step: fund the escrow so Li Wei can start.',
    cta: 'Fund escrow',
    ctaTone: 'brand',
  },
  {
    id: 'a-approve',
    statusLabel: 'Submitted',
    tone: 'positive',
    title: 'Brand identity & packaging',
    meta: 'Kwame Mensah · ₦300,000.00',
    nextStep: 'Next step: review the delivery, then release ₦300,000.',
    cta: 'Approve & release',
    ctaTone: 'positive',
  },
  {
    id: 'a-dispute',
    statusLabel: 'Under review',
    tone: 'negative',
    title: 'Dispute #D-2041',
    meta: 'Milestone 3 · ₦300,000.00',
    nextStep: 'Next step: add your evidence before Fri 14 Aug.',
    cta: 'Add evidence',
    ctaTone: 'danger',
  },
];

export interface ActiveDeal {
  id: string;
  title: string;
  counterparty: string;
  amount: number;
  currency: string;
  /** Cross-currency equivalent line, e.g. "≈ GHS 9,840". */
  equivalent?: string;
  statusLabel: string;
  nextStep: string;
  /** True when the viewer is the payee on this deal ("you get paid"). */
  youGetPaid?: boolean;
  /** Coloured avatar tile tone (mobile deal cards). */
  avatarTone?: 'brand' | 'warning' | 'positive' | 'neutral';
  /** "to" / "from" prefix on the mobile subtitle. */
  relation?: 'to' | 'from';
  /** i18n key for the subtitle detail chunk (milestones / single payment / …). */
  detailKey?: string;
  detailParams?: Record<string, string | number>;
}

export const activeDeals: ActiveDeal[] = [
  {
    id: 'd-1',
    title: 'Brand identity & packaging',
    counterparty: 'Kwame Mensah',
    amount: 1_200_000,
    currency: 'NGN',
    equivalent: '≈ GHS 9,840',
    statusLabel: 'In progress',
    nextStep: 'Approve milestone 3',
    avatarTone: 'brand',
    relation: 'to',
    detailKey: 'dashboard.milestonesShort',
    detailParams: { done: 2, total: 4 },
  },
  {
    id: 'd-2',
    title: '200 solar lamps - bulk order',
    counterparty: 'Li Wei',
    amount: 750_000,
    currency: 'NGN',
    equivalent: '≈ $486.00',
    statusLabel: 'Awaiting funding',
    nextStep: 'Fund escrow',
    avatarTone: 'warning',
    relation: 'to',
    detailKey: 'deals.meta.singlePayment',
  },
  {
    id: 'd-3',
    title: 'Office fit-out photography',
    counterparty: 'Amina Bello',
    amount: 180_000,
    currency: 'NGN',
    statusLabel: 'In review',
    nextStep: 'Waiting for approval',
    youGetPaid: true,
    avatarTone: 'positive',
    relation: 'from',
    detailKey: 'dashboard.youGetPaid',
  },
];

/** Escrow-flow bar chart - funded vs released per month (handoff palette). */
export const escrowFlow = [
  { label: 'Mar', funded: 900_000, released: 420_000 },
  { label: 'Apr', funded: 1_250_000, released: 780_000 },
  { label: 'May', funded: 1_400_000, released: 900_000 },
  { label: 'Jun', funded: 1_150_000, released: 1_120_000 },
  { label: 'Jul', funded: 1_750_000, released: 820_000 },
  { label: 'Aug', funded: 1_950_000, released: 1_300_000 },
];

/** "Escrow by deal" donut segments (values are relative weights → % in the legend). */
export const escrowByDeal = [
  { label: 'Brand identity', value: 46 },
  { label: 'Solar lamps', value: 24 },
  { label: 'Photography', value: 18 },
  { label: 'Other', value: 12 },
];

export type ActivityType = 'submitted' | 'dispute' | 'topup' | 'security';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  meta: string;
  unread: boolean;
}

export const activityFeed: ActivityItem[] = [
  { id: 'n1', type: 'submitted', title: 'Milestone submitted', meta: 'Kwame Mensah · 2h', unread: true },
  { id: 'n2', type: 'dispute', title: 'Mediator needs evidence', meta: '#D-2041 · 1 day ago', unread: true },
  { id: 'n3', type: 'topup', title: 'Wallet topped up', meta: '₦250,000 · 1 day ago', unread: true },
  { id: 'n4', type: 'security', title: 'New sign-in', meta: 'Chrome · Windows · 5 days ago', unread: false },
];
