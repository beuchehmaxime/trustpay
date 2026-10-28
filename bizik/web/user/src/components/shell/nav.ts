import {
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Handshake,
  HelpCircle,
  Home,
  Receipt,
  Settings,
  ShieldCheck,
  User,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** Which live count (if any) drives this item's badge. */
export type NavBadge = 'dealsAction' | 'openDisputes' | 'unread';

export interface NavItem {
  /** i18n key (resolved with `t()` in the component). */
  labelKey: string;
  href: string;
  icon: LucideIcon;
  badge?: NavBadge;
}

export interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

/** Desktop sidebar structure (handoff §Navigation model). */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'group.overview',
    items: [{ labelKey: 'nav.dashboard', href: '/dashboard', icon: Home }],
  },
   {
    labelKey: 'group.work',
    items: [
      { labelKey: 'nav.deals', href: '/deals', icon: Handshake, badge: 'dealsAction' },
      { labelKey: 'nav.disputes', href: '/disputes', icon: ShieldCheck, badge: 'openDisputes' },
    ],
  },

  
  {
    labelKey: 'group.money',
    items: [
      { labelKey: 'nav.wallet', href: '/wallet', icon: Wallet },
      { labelKey: 'nav.addMoney', href: '/wallet/add', icon: ArrowDownToLine },
      { labelKey: 'nav.withdraw', href: '/wallet/withdraw', icon: ArrowUpFromLine },
      { labelKey: 'nav.convert', href: '/wallet/convert', icon: ArrowLeftRight },
      { labelKey: 'nav.transactions', href: '/wallet/transactions', icon: Receipt },
    ],
  },
 
  {
    labelKey: 'group.settings',
    items: [
      { labelKey: 'nav.settings', href: '/settings', icon: Settings },
      { labelKey: 'nav.help', href: '/support', icon: HelpCircle },
    ],
  },
];

/** Mobile bottom tab bar: Home · Deals · [+] · Disputes · Profile. */
export const BOTTOM_TABS: NavItem[] = [
  { labelKey: 'nav.home', href: '/dashboard', icon: Home },
  { labelKey: 'nav.deals', href: '/deals', icon: Handshake },
  { labelKey: 'nav.disputes', href: '/disputes', icon: ShieldCheck },
  { labelKey: 'nav.profile', href: '/profile', icon: User },
];

export const NEW_DEAL_HREF = '/deals/new';

/** Every sidebar item href, for longest-prefix active resolution. */
const ALL_NAV_HREFS = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));

/**
 * The single active sidebar href for a path - the LONGEST matching href, so a
 * child route like `/wallet/add` activates only "Deposit" and not the parent
 * "Wallet". Returns null when nothing matches.
 */
export function activeNavHref(pathname: string): string | null {
  const matches = ALL_NAV_HREFS.filter(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, href) => (href.length > best.length ? href : best));
}

/** Live badge counts. Representative until wired to the wallet/deals/notifications APIs. */
export const NAV_BADGE_COUNTS: Record<NavBadge, number> = {
  dealsAction: 2,
  openDisputes: 1,
  unread: 3,
};

/** The sidebar group key that owns a path - used for the desktop breadcrumb. */
export function groupKeyForPath(pathname: string): string {
  if (pathname === '/profile' || pathname.startsWith('/profile/')) return 'group.account';
  if (pathname === '/activity' || pathname.startsWith('/activity/')) return 'group.money';
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))) {
      return group.labelKey;
    }
  }
  return 'group.overview';
}

/** The active nav item's label key for a path - used for the page title. */
export function titleKeyForPath(pathname: string): string {
  if (pathname === '/profile' || pathname.startsWith('/profile/')) return 'nav.profile';
  if (pathname === '/wallet/convert' || pathname.startsWith('/wallet/convert/')) return 'convert.titleFx';
  if (pathname === '/activity' || pathname.startsWith('/activity/')) return 'activity.title';
  if (pathname.startsWith('/deals/') && pathname !== '/deals/new') return 'deals.detailTitle';
  if (pathname.startsWith('/disputes/')) return 'disputes.detailTitle';
  if (pathname === '/settings') return 'settings.hubTitle';
  if (pathname === '/settings/personal') return 'settings.nav.personal';
  if (pathname === '/settings/kyc') return 'settings.nav.kyc';
  if (pathname === '/settings/security') return 'settings.nav.security';
  if (pathname === '/settings/payouts') return 'settings.nav.payouts';
  if (pathname === '/settings/language') return 'settings.nav.languageTitle';
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.labelKey;
    }
  }
  return 'nav.dashboard';
}
