'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';

import { Logo } from '@/components/logo';
import { useNavBadgeCounts } from '@/lib/hooks/use-nav-badges';
import { cn } from '@/lib/utils';
import { activeNavHref, NAV_GROUPS, NEW_DEAL_HREF, type NavBadge } from './nav';

/** Per-badge colour: a solid count pill and its collapsed-rail dot. */
const BADGE_TONE: Record<NavBadge, { pill: string; dot: string }> = {
  dealsAction: { pill: 'bg-amber-500 text-white', dot: 'bg-amber-500' },
  openDisputes: { pill: 'bg-negative text-white', dot: 'bg-negative' },
  unread: { pill: 'bg-brand-500 text-white', dot: 'bg-brand-500' },
};

/**
 * Desktop navigation sidebar. Icon rail (74px) on tablet, full (250px) on
 * desktop - labels reveal at `lg`. Hidden below `md` (mobile uses bottom tabs).
 * The account controls live in the top bar's user menu, not here.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const active = activeNavHref(pathname);
  const badgeCounts = useNavBadgeCounts();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[74px] flex-col border-r border-hairline bg-surface md:flex lg:w-[250px]">
      {/* Brand */}
      <div className="flex shrink-0 items-center justify-center px-3 py-6 lg:justify-start lg:px-5">
        <Logo iconOnly className="lg:hidden" />
        <Logo className="hidden lg:flex" />
      </div>

      {/* Primary action */}
      <div className="px-3 pb-4 lg:px-4">
        <Link
          href={NEW_DEAL_HREF}
          className="bg-primary text-primary-foreground shadow-brand flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition hover:opacity-95"
        >
          <Plus className="size-4" />
          <span className="hidden lg:inline">{t('nav.newDeal')}</span>
        </Link>
      </div>

      {/* Groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 pb-6 lg:px-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="mb-6">
            <p className="mb-3 hidden px-2 text-[10.5px] font-bold uppercase tracking-wider text-subtle lg:block">
              {t(group.labelKey)}
            </p>
            <ul className="space-y-1.5">
              {group.items.map((item) => {
                const isItemActive = item.href === active;
                const badgeKey = item.badge;
                const count = badgeKey ? badgeCounts[badgeKey] : 0;
                const tone = badgeKey ? BADGE_TONE[badgeKey] : null;
                const showBadge = count > 0 && tone !== null;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                        'justify-center lg:justify-start',
                        isItemActive
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-muted-foreground hover:bg-muted hover:text-ink',
                      )}
                    >
                      <span className="relative">
                        <item.icon className="size-[18px]" strokeWidth={isItemActive ? 2.2 : 1.9} />
                        {showBadge ? (
                          <span
                            className={cn(
                              'absolute -right-1.5 -top-1.5 size-2 rounded-full ring-2 ring-surface lg:hidden',
                              tone.dot,
                            )}
                          />
                        ) : null}
                      </span>
                      <span className="hidden flex-1 truncate lg:inline">{t(item.labelKey)}</span>
                      {showBadge ? (
                        <span
                          className={cn(
                            'hidden h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none tabular-nums lg:inline-flex',
                            tone.pill,
                          )}
                        >
                          {count > 99 ? '99+' : count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
