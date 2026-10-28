'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  Eye,
  Repeat,
  TrendingDown,
  TrendingUp,
  UserPlus,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { usePermission } from '@/lib/auth/permissions';
import {
  useFinancialAnalytics,
  useProductAnalytics,
} from '@/features/analytics/business.hooks';
import { AreaChart } from '@/features/analytics/charts';
import { useRange } from '@/features/analytics/range';
import { Callout, Card, CardBody, CardHeader, Loading, xaf } from '@/features/analytics/ui';

/**
 * Overview: the page you open to find out whether anything needs you.
 *
 * Four numbers, whatever is currently wrong, and a way into the detail. It
 * deliberately does not try to show everything - the previous version did, and
 * the result was that nothing on it stood out, which is the same as nothing on
 * it being seen.
 */
export default function BusinessOverviewPage() {
  const canSeeProduct = usePermission('analytics.product');
  const canSeeFinancial = usePermission('analytics.financial');
  const { days } = useRange();

  const product = useProductAnalytics(days, canSeeProduct);
  const financial = useFinancialAnalytics(undefined, canSeeFinancial);

  const loading =
    (canSeeProduct && product.isLoading) || (canSeeFinancial && financial.isLoading);
  if (loading) return <Loading />;

  const visits = product.data?.visits;
  const funnel = product.data?.funnel;
  const activity = product.data?.activity;
  const revenue = financial.data?.revenue;
  const profitability = financial.data?.profitability;

  const accountsCreated = funnel?.stages[0]?.count ?? null;

  return (
    <div className="space-y-6">
      {/* ── Headline ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canSeeProduct ? (
          <>
            <Kpi
              icon={<Eye className="size-4" />}
              tone="brand"
              label="Visitors, all time"
              value={visits ? visits.allTime.toLocaleString('en-US') : null}
              note={visits ? `${visits.today.toLocaleString('en-US')} today` : undefined}
            />
            <Kpi
              icon={<UserPlus className="size-4" />}
              tone="violet"
              label="Accounts created"
              value={accountsCreated === null ? null : accountsCreated.toLocaleString('en-US')}
              note="All time"
            />
          </>
        ) : null}

        {canSeeFinancial ? (
          <>
            <Kpi
              icon={<Banknote className="size-4" />}
              tone="emerald"
              label="Revenue, 30 days"
              value={revenue ? xaf(revenue.last30dXaf) : null}
              delta={revenue?.growthRate ?? null}
              note="vs the 30 days before"
            />
            <Kpi
              icon={<Repeat className="size-4" />}
              tone="amber"
              label={`EBITDA, ${profitability?.month ?? 'this month'}`}
              value={
                profitability?.ebitdaXaf === null || profitability === undefined
                  ? null
                  : xaf(profitability.ebitdaXaf)
              }
              note={profitability?.ebitdaXaf === null ? 'No costs entered' : 'Revenue less costs'}
            />
          </>
        ) : (
          <>
            <Kpi
              icon={<Repeat className="size-4" />}
              tone="emerald"
              label="Monthly active"
              value={activity ? activity.mau.toLocaleString('en-US') : null}
              note="Signed in within 30 days"
            />
            <Kpi
              icon={<TrendingDown className="size-4" />}
              tone="amber"
              label="Never returned"
              value={activity ? activity.oneAndDone.toLocaleString('en-US') : null}
              note="Signed in exactly once"
            />
          </>
        )}
      </div>

      {/* ── What is wrong ── */}
      {funnel?.biggestDropOff || profitability?.gap || visits?.allTime === 0 ? (
        <Card>
          <CardHeader
            title="Needs attention"
            description="Only things that are actionable or that stop a number being computed at all."
          />
          <CardBody className="space-y-3">
            {funnel?.biggestDropOff ? (
              <Callout tone="warning">
                The largest loss is between <strong>{funnel.biggestDropOff.from}</strong> and{' '}
                <strong>{funnel.biggestDropOff.to}</strong>: {funnel.biggestDropOff.lost} people.
                Nothing further down the funnel can improve until that does.{' '}
                <Link href="/business/funnel" className="font-semibold underline underline-offset-2">
                  Open the funnel
                </Link>
              </Callout>
            ) : null}
            {profitability?.gap ? (
              <Callout tone="warning">
                <strong>{profitability.gap.metric} cannot be calculated.</strong>{' '}
                {profitability.gap.reason} {profitability.gap.needs}{' '}
                <Link href="/business/costs" className="font-semibold underline underline-offset-2">
                  Enter this month&apos;s costs
                </Link>
              </Callout>
            ) : null}
            {visits?.allTime === 0 ? (
              <Callout>
                No visits recorded yet. Visit tracking went live with this release, so it fills from
                here onward - it cannot show traffic from before it existed.
              </Callout>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* ── Traffic shape ── */}
      {canSeeProduct && product.data ? (
        <Card>
          <CardHeader
            title="Visitors per day"
            description={`Distinct people, over the last ${days} days. Counted first-party: nothing is sent to an advertising network, and anyone with Do Not Track set is not counted at all.`}
            action={
              <Link
                href="/business/audience"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:opacity-80"
              >
                Audience detail <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <CardBody>
            <AreaChart
              points={product.data.daily.map((day) => ({
                label: day.date.slice(5),
                value: day.visitors,
              }))}
            />
          </CardBody>
        </Card>
      ) : null}

      {/* ── Ways in ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canSeeProduct ? (
          <>
            <SectionLink
              href="/business/audience"
              title="Audience"
              blurb="Who arrives, where from, which pages hold them and where they leave."
            />
            <SectionLink
              href="/business/funnel"
              title="Funnel"
              blurb="Every step between arriving and money moving, and what is lost at each."
            />
            <SectionLink
              href="/business/retention"
              title="Retention"
              blurb="Who comes back, and whether each signup week is doing better than the last."
            />
          </>
        ) : null}
        {canSeeFinancial ? (
          <SectionLink
            href="/business/revenue"
            title="Revenue & profit"
            blurb="Fee income, GMV, take rate, and what the months cost against what they earned."
          />
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- pieces */

const KPI_TONE: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
};

function Kpi({
  icon,
  tone,
  label,
  value,
  note,
  delta,
}: {
  icon: ReactNode;
  tone: keyof typeof KPI_TONE | string;
  label: string;
  value: string | null;
  note?: string;
  delta?: number | null;
}) {
  return (
    <div className="shadow-card rounded-xl border border-hairline bg-surface p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex size-8 items-center justify-center rounded-lg', KPI_TONE[tone])}>
          {icon}
        </span>
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
      </div>
      {value === null ? (
        <p className="mt-3 text-[15px] font-medium text-subtle">Not available</p>
      ) : (
        <p className="mt-3 text-[26px] leading-tight font-bold wrap-break-word tabular-nums text-ink">
          {value}
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        {delta !== undefined && delta !== null ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[12px] font-semibold',
              delta >= 0 ? 'text-positive-text' : 'text-negative',
            )}
          >
            {delta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {Math.abs(delta * 100).toFixed(0)}%
          </span>
        ) : null}
        {note ? <span className="text-[12px] text-muted-foreground">{note}</span> : null}
      </div>
    </div>
  );
}

function SectionLink({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      className="shadow-card hover:shadow-card-hover group rounded-xl border border-hairline bg-surface p-5 transition hover:border-brand-200"
    >
      <p className="flex items-center justify-between text-[14px] font-semibold text-ink">
        {title}
        <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{blurb}</p>
    </Link>
  );
}
