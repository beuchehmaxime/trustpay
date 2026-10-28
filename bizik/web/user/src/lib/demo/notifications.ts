/**
 * Representative notification feed - the single stream behind the top-bar bell
 * and the Activity page. Every system event that warrants a heads-up appears
 * here (deals, money movement, disputes, identity, security). Swap for a live
 * notifications hook when that API is wired.
 */

export type NotificationCategory = 'deal' | 'money' | 'dispute' | 'identity' | 'security';

/** Drives the icon + colour tone; also the i18n key under `activity.kind.*`. */
export type NotificationKind =
  | 'milestoneSubmitted'
  | 'mediatorEvidence'
  | 'walletToppedUp'
  | 'identityVerified'
  | 'newSignIn'
  | 'escrowReleased'
  | 'dealInvite'
  | 'withdrawalSent'
  | 'revisionRequested'
  | 'deliveryDue'
  | 'conversionDone'
  | 'disputeResolved';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  category: NotificationCategory;
  /** Values interpolated into the `activity.kind.<kind>.body` template. */
  params: Record<string, string>;
  /** Relative age: whole number + unit, formatted through i18n. */
  time: { value: number; unit: 'h' | 'd' };
  unread: boolean;
}

export const notifications: AppNotification[] = [
  {
    id: 'n1',
    kind: 'milestoneSubmitted',
    category: 'deal',
    params: { name: 'Kwame Mensah', n: '3', amount: '₦300,000' },
    time: { value: 2, unit: 'h' },
    unread: true,
  },
  {
    id: 'n2',
    kind: 'mediatorEvidence',
    category: 'dispute',
    params: { ref: '#D-2041', date: 'Fri 14 Aug' },
    time: { value: 1, unit: 'd' },
    unread: true,
  },
  {
    id: 'n3',
    kind: 'walletToppedUp',
    category: 'money',
    params: { amount: '₦250,000', method: 'MTN Mobile Money •••• 5566' },
    time: { value: 1, unit: 'd' },
    unread: true,
  },
  {
    id: 'n4',
    kind: 'identityVerified',
    category: 'identity',
    params: { amount: '₦10,000,000' },
    time: { value: 3, unit: 'd' },
    unread: false,
  },
  {
    id: 'n5',
    kind: 'newSignIn',
    category: 'security',
    params: { device: 'Chrome on Windows', location: 'Lagos, NG' },
    time: { value: 5, unit: 'd' },
    unread: false,
  },
  {
    id: 'n6',
    kind: 'escrowReleased',
    category: 'money',
    params: { amount: '₦180,000', deal: 'Office fit-out photography' },
    time: { value: 6, unit: 'd' },
    unread: false,
  },
  {
    id: 'n7',
    kind: 'dealInvite',
    category: 'deal',
    params: { name: 'Amina Bello', deal: '200 solar lamps' },
    time: { value: 7, unit: 'd' },
    unread: false,
  },
  {
    id: 'n8',
    kind: 'withdrawalSent',
    category: 'money',
    params: { amount: '₦120,000', method: 'GTBank •••• 0142' },
    time: { value: 9, unit: 'd' },
    unread: false,
  },
  {
    id: 'n9',
    kind: 'revisionRequested',
    category: 'deal',
    params: { name: 'Li Wei', deal: 'Brand identity kit' },
    time: { value: 11, unit: 'd' },
    unread: false,
  },
  {
    id: 'n10',
    kind: 'disputeResolved',
    category: 'dispute',
    params: { ref: '#D-1988' },
    time: { value: 14, unit: 'd' },
    unread: false,
  },
];

/** Unread total that drives the top-bar bell badge. */
export const unreadNotificationCount = notifications.filter((item) => item.unread).length;
