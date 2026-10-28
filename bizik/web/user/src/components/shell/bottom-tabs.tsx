'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { BOTTOM_TABS, NAV_BADGE_COUNTS, NEW_DEAL_HREF } from './nav';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Mobile bottom tab bar: Home · Deals · [ + ] · Disputes · Profile, with a raised
 * centre FAB that starts a new deal. Hidden at `md` and up (desktop uses the
 * sidebar). Safe-area padding for the home indicator.
 */
export function BottomTabs() {
  const pathname = usePathname();
  const left = BOTTOM_TABS.slice(0, 2);
  const right = BOTTOM_TABS.slice(2);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-hairline bg-surface px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 md:hidden">
      {left.map((tab) => (
        <Tab key={tab.href} tab={tab} active={isActive(pathname, tab.href)} />
      ))}

      <div className="flex w-16 justify-center">
        <Link
          href={NEW_DEAL_HREF}
          aria-label="New deal"
          className="bg-primary text-primary-foreground shadow-fab -mt-7 flex size-14 items-center justify-center rounded-full"
        >
          <Plus className="size-7" />
        </Link>
      </div>

      {right.map((tab) => (
        <Tab key={tab.href} tab={tab} active={isActive(pathname, tab.href)} />
      ))}
    </nav>
  );
}

function Tab({
  tab,
  active,
}: {
  tab: (typeof BOTTOM_TABS)[number];
  active: boolean;
}) {
  const { t } = useTranslation();
  const count = tab.badge ? NAV_BADGE_COUNTS[tab.badge] : 0;
  return (
    <Link
      href={tab.href}
      className={cn(
        'flex flex-1 flex-col items-center gap-0.5 py-1',
        active ? 'text-brand-700' : 'text-subtle',
      )}
    >
      <span className="relative">
        <tab.icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.9} />
        {count > 0 ? (
          <span className="absolute -right-2 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-negative px-1 py-px text-[9px] font-bold leading-none text-white ring-2 ring-surface">
            {count}
          </span>
        ) : null}
      </span>
      <span className="text-[11px] font-medium">{t(tab.labelKey)}</span>
    </Link>
  );
}
