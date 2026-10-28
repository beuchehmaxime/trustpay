/**
 * Representative account/settings + support data (persona: Ada Okafor).
 * Swap for live profile / KYC / sessions / payout / support hooks when wired.
 */

export const settingsProfile = {
  fullName: 'Ada Okafor',
  initials: 'AO',
  phoneCountryRegion: 'NG',
  phoneCountryCode: '+234',
  phoneLocal: '803 441 9902',
  phoneFull: '+234 803 441 9902',
  email: 'ada@korastudio.ng',
  company: 'Kora Studio Ltd',
  countryName: 'Nigeria',
  countryRegion: 'NG',
  currency: 'NGN',
  location: 'Lagos, NG',
  tier: 2,
  kycVerified: true,
  dealsDone: 12,
  onTimePct: 100,
  rating: 4.9,
  monthlyLimit: '₦10M',
  passwordChanged: '12 Mar 2026',
  twoFactorLast: '9902',
} as const;

export interface Session {
  id: string;
  device: string;
  detailKey?: string; // i18n key (e.g. this device)
  detailText?: string; // literal (e.g. "5 days ago")
  current: boolean;
}

export const sessions: Session[] = [
  { id: 's1', device: 'iPhone 15 · Lagos, NG', detailKey: 'settings.security.thisDevice', current: true },
  { id: 's2', device: 'Chrome · Windows', detailText: '5 days ago', current: false },
];

export type PayoutKind = 'momo' | 'bank' | 'payoneer';
export type PayoutBadge = 'default' | 'verified' | 'pending';

export interface SettingsPayoutMethod {
  id: string;
  kind: PayoutKind;
  name: string;
  detail: string;
  currency: string;
  badge: PayoutBadge;
}

export const settingsPayoutMethods: SettingsPayoutMethod[] = [
  { id: 'p1', kind: 'momo', name: 'MTN Mobile Money', detail: '•••• 5566', currency: 'NGN', badge: 'default' },
  { id: 'p2', kind: 'bank', name: 'GTBank', detail: '•••• 0142', currency: 'NGN', badge: 'verified' },
  { id: 'p3', kind: 'payoneer', name: 'Payoneer', detail: 'ada@korastudio.ng', currency: 'USD', badge: 'pending' },
];

/** Summary of payout provider names, for the settings hub card. */
export const payoutMethodNames = settingsPayoutMethods.map((method) => method.name).join(' · ');

// ---- Help & support ------------------------------------------------------

/** Fixed set of popular articles; titles resolved via `support.articles.<key>`. */
export const helpArticleKeys = ['escrow', 'dispute', 'fx'] as const;

export type TicketStatus = 'open' | 'resolved';

export interface SupportTicket {
  id: string;
  status: TicketStatus;
  title: string;
  age: string;
  metaKey: string;
  metaParams: Record<string, string>;
}

export const supportTickets: SupportTicket[] = [
  {
    id: 'T-8841',
    status: 'open',
    title: 'Payout to GTBank still processing',
    age: '2 days ago',
    metaKey: 'support.lastReply',
    metaParams: { by: 'BiZik Support', time: '6 h' },
  },
  {
    id: 'T-8712',
    status: 'resolved',
    title: 'Wrong currency shown on invite',
    age: '3 weeks ago',
    metaKey: 'support.closedBy',
    metaParams: { by: 'BiZik Support' },
  },
];
