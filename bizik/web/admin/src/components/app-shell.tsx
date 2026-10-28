'use client';
import Image from 'next/image';

import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bell,
  FolderKanban,
  Gavel,
  Megaphone,
  MessageCircle,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LineChart,
  LifeBuoy,
  LogOut,
  Newspaper,
  Percent,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/notification-bell';
import { AccountMenu } from '@/components/account-menu';
import { useAuthStore } from '@/lib/auth/auth.store';
import { hasPermission } from '@/lib/auth/permissions';
import type { AuthUser } from '@/lib/auth/types';
import { useKycPendingCount } from '@/features/kyc/hooks';
import { useAmlOpenCount } from '@/features/aml/hooks';
import { usePayoutQueueCount, useWithdrawalHoldCount } from '@/features/wallets/hooks';
import { useDisputeOpenCount } from '@/features/disputes/hooks';
import { useNotifyUnread } from '@/features/notifyadmin/hooks';
import { useSupportOpenCount } from '@/features/support/hooks';

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Permission required to see the item; null = always visible to operators.
   * An array means any one of them is enough, for a section built from several
   * independently granted parts.
   */
  perm: string | string[] | null;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/** Whether an operator may see a nav item. An array of permissions is "any of". */
function canSeeNavItem(user: AuthUser | null, item: NavItem): boolean {
  if (!item.perm) return true;
  const required = Array.isArray(item.perm) ? item.perm : [item.perm];
  return required.some((permission) => hasPermission(user, permission));
}

/** The full platform-section navigation, grouped by area. */
const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view' }],
  },
  {
    label: 'People',
    items: [{ href: '/users', label: 'Users & accounts', icon: Users, perm: 'users.view' }],
  },
  {
    label: 'Trust & safety',
    items: [
      { href: '/kyc', label: 'KYC review', icon: ShieldCheck, perm: 'kyc.view' },
      { href: '/aml', label: 'AML & sanctions', icon: ShieldAlert, perm: 'aml.view' },
      { href: '/disputes', label: 'Disputes', icon: Gavel, perm: 'disputes.view' },
      { href: '/audit', label: 'Audit log', icon: ScrollText, perm: 'audit.view' },
      { href: '/whatsapp', label: 'WhatsApp channel', icon: MessageCircle, perm: 'whatsapp.view' },
      // Separate entry, separate permission: reading conversations is support
      // work, sending unprompted messages to thousands of people is not.
      { href: '/whatsapp-outreach', label: 'WhatsApp outreach', icon: Megaphone, perm: 'outreach.view' },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { href: '/contracts', label: 'Deals', icon: FolderKanban, perm: 'contracts.view' },
      { href: '/escrow', label: 'Escrow & transactions', icon: Landmark, perm: 'escrow.view' },
      { href: '/wallets', label: 'Wallets & payouts', icon: Wallet, perm: 'wallets.view' },
      { href: '/fees', label: 'Fees & FX', icon: Percent, perm: 'fees.view' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/notifications', label: 'Notifications', icon: Bell, perm: null },
      { href: '/reports', label: 'Reports & analytics', icon: BarChart3, perm: 'reports.view' },
      // Business analytics is a different audience from regulatory reports:
      // this is the funnel, retention and P&L a founder runs the company on.
      // Either grant opens it - the section hides the tabs the operator's own
      // permission does not cover, so a financial-only operator still has a way
      // in rather than a section that appears not to exist.
      {
        href: '/business',
        label: 'Business analytics',
        icon: LineChart,
        perm: ['analytics.product', 'analytics.financial'],
      },
    ],
  },
  {
    label: 'Access & settings',
    items: [
      { href: '/roles', label: 'Roles', icon: KeyRound, perm: 'roles.view' },
      { href: '/operators', label: 'Operators', icon: UserCog, perm: 'operators.view' },
      { href: '/settings', label: 'Settings', icon: Settings, perm: 'settings.view' },
      { href: '/support', label: 'Support', icon: LifeBuoy, perm: 'support.view' },
      { href: '/blog', label: 'Blog', icon: Newspaper, perm: 'support.view' },
    ],
  },
];

const ENV_LABEL = process.env.NODE_ENV === 'production' ? 'Production' : 'Development';

/** Admin chrome: a grouped, permission-gated sidebar + a top bar. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const canViewKyc = hasPermission(user, 'kyc.view');
  const { data: kycPending } = useKycPendingCount(canViewKyc);
  const canViewAml = hasPermission(user, 'aml.view');
  const { data: amlOpen } = useAmlOpenCount(canViewAml);
  const canViewPayouts = hasPermission(user, 'payouts.view');
  const { data: payoutQueue } = usePayoutQueueCount(canViewPayouts);
  const { data: withdrawalHolds } = useWithdrawalHoldCount(canViewPayouts);
  const canViewDisputes = hasPermission(user, 'disputes.view');
  const { data: disputesOpen } = useDisputeOpenCount(canViewDisputes);
  const { data: unreadNotifications } = useNotifyUnread(!!user);
  const canViewSupport = hasPermission(user, 'support.view');
  const { data: supportOpen } = useSupportOpenCount(canViewSupport);

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  // Keep only the items (and groups) the signed-in operator may see.
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeNavItem(user, item)),
  })).filter((group) => group.items.length > 0);

  // Resolve the current page name for the top-bar breadcrumb.
  const activeItem = NAV_GROUPS.flatMap((group) => group.items).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const roleLabel = user?.isSuperAdmin ? 'Super Admin' : user?.adminRole?.name;

  function badgeFor(href: string): number | undefined {
    if (href === '/kyc' && kycPending && kycPending > 0) return kycPending;
    if (href === '/aml' && amlOpen && amlOpen > 0) return amlOpen;
    if (href === '/wallets') {
      const walletsBadge = (payoutQueue ?? 0) + (withdrawalHolds ?? 0);
      if (walletsBadge > 0) return walletsBadge;
    }
    if (href === '/disputes' && disputesOpen && disputesOpen > 0) return disputesOpen;
    if (href === '/notifications' && unreadNotifications && unreadNotifications > 0)
      return unreadNotifications;
    if (href === '/support' && supportOpen && supportOpen > 0) return supportOpen;
    return undefined;
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sticky sidebar - fixed height, never scrolls with the page. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b px-5">
          <Image
            src="/brand/logo-icon.png"
            alt=""
            width={36}
            height={36}
            priority
            className="size-9 w-auto object-contain"
          />
          <div className="leading-tight">
            <p className="text-sm font-bold text-ink">BiZik Admin</p>
            <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
              Platform Console
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {groups.map((group, groupIndex) => (
            <div key={group.label ?? `group-${groupIndex}`} className="space-y-1">
              {group.label ? (
                <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
                  {group.label}
                </p>
              ) : null}
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                const badge = badgeFor(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-slate-600 hover:bg-sidebar-accent/60 hover:text-ink',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge !== undefined ? (
                      <span
                        className={cn(
                          'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                          active ? 'bg-black/20 text-white' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t p-3">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Content column - header stays put, only the main area scrolls. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-surface px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden font-medium text-muted-foreground sm:inline">BiZik Admin</span>
            <span className="hidden text-muted-foreground/40 sm:inline">/</span>
            <span className="truncate font-semibold text-ink">{activeItem?.label ?? 'Dashboard'}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase lg:inline-flex">
              <span className="size-1.5 rounded-full bg-positive" />
              {ENV_LABEL}
            </span>
            <NotificationBell />
            {roleLabel ? (
              <span className="hidden rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-brand-700 uppercase sm:inline">
                {roleLabel}
              </span>
            ) : null}
            <AccountMenu />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
