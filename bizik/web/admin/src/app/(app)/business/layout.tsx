'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { usePermission } from '@/lib/auth/permissions';
import { RangePicker, RangeProvider } from '@/features/analytics/range';

/**
 * Business analytics: the shell its six pages share.
 *
 * One page used to hold all of this. It worked, in that every figure was on
 * screen, but nobody can act on nine stacked blocks at once - the funnel, the
 * cohort table and the P&L are three different questions asked by three
 * different people on three different days, and putting them in one scroll made
 * each of them harder to find than if it had been on its own.
 *
 * So: a short overview that answers "is anything wrong", and a tab per question.
 *
 * The tabs are permission-filtered, not permission-disabled. An operator with
 * growth access and no financial access does not see a Revenue tab at all,
 * rather than seeing one that rejects them - a visible door you may not open
 * tells you what exists, which is itself a disclosure.
 */

interface Tab {
  href: string;
  label: string;
  /** Any one of these grants the tab. */
  permissions: string[];
  /** Whether the reporting-window picker applies to this tab. */
  ranged: boolean;
}

const TABS: Tab[] = [
  { href: '/business', label: 'Overview', permissions: ['analytics.product', 'analytics.financial'], ranged: true },
  { href: '/business/audience', label: 'Audience', permissions: ['analytics.product'], ranged: true },
  { href: '/business/funnel', label: 'Funnel', permissions: ['analytics.product'], ranged: true },
  { href: '/business/retention', label: 'Retention', permissions: ['analytics.product'], ranged: false },
  { href: '/business/revenue', label: 'Revenue & profit', permissions: ['analytics.financial'], ranged: false },
  { href: '/business/costs', label: 'Operating costs', permissions: ['analytics.financial'], ranged: false },
];

export default function BusinessLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const canSeeProduct = usePermission('analytics.product');
  const canSeeFinancial = usePermission('analytics.financial');

  const held = new Set<string>();
  if (canSeeProduct) held.add('analytics.product');
  if (canSeeFinancial) held.add('analytics.financial');

  const tabs = TABS.filter((tab) => tab.permissions.some((permission) => held.has(permission)));
  const active = TABS.find((tab) => tab.href === pathname);

  if (tabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-hairline py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Business analytics needs the product or financial analytics permission. A super admin
          can grant either under Roles.
        </p>
      </div>
    );
  }

  return (
    <RangeProvider>
      <div className="space-y-6">
        <header>
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Insights
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Business analytics</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-muted-foreground">
            Every figure here is computed from real rows. Anything that cannot be computed says so
            instead of showing a zero.
          </p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Business analytics sections">
            {tabs.map((tab) => {
              const current = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium transition',
                    current
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-muted-foreground hover:border-hairline hover:text-ink',
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          {active?.ranged ? (
            <div className="pb-2">
              <RangePicker />
            </div>
          ) : null}
        </div>

        {children}
      </div>
    </RangeProvider>
  );
}
