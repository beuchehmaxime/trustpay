'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Gavel,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth/auth.store';
import { hasPermission } from '@/lib/auth/permissions';
import { firstAccessibleRoute } from '@/lib/auth/landing';
import { useDashboard } from '@/features/dashboard/hooks';
import type { ActivityRow, TrendPoint } from '@/features/dashboard/types';

export default function DashboardPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state.hydrated);
  const canView = hasPermission(user, 'dashboard.view');

  // Operators without dashboard access are sent to their first allowed section.
  useEffect(() => {
    if (hydrated && user && !canView) {
      router.replace(firstAccessibleRoute(user));
    }
  }, [hydrated, user, canView, router]);

  const { data, isLoading } = useDashboard(canView);

  if (!canView) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const kpis = data?.kpis ?? {};
  const queues = data?.queues ?? {};
  const charts = data?.charts ?? {};
  const activity = data?.recentActivity ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase">
          <span className="text-muted-foreground">BiZik Admin</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform health and what needs your attention today.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.gmv ? (
          <KpiCard label="GMV · 30 days" value={usd(kpis.gmv.value, true)} delta={kpis.gmv.delta} deltaSuffix="vs prior 30d" />
        ) : null}
        {kpis.fundsInEscrow ? (
          <KpiCard
            label="Funds in escrow"
            value={usd(kpis.fundsInEscrow.value)}
            note={`across ${kpis.fundsInEscrow.milestones.toLocaleString()} milestones`}
          />
        ) : null}
        {kpis.activeProjects ? (
          <KpiCard
            label="Active deals"
            value={kpis.activeProjects.value.toLocaleString()}
            delta={kpis.activeProjects.thisWeek}
            deltaSuffix="this week"
            deltaAbsolute
          />
        ) : null}
        {kpis.pendingPayouts ? (
          <KpiCard
            label="Pending payouts"
            value={kpis.pendingPayouts.value.toLocaleString()}
            note={`${usd(kpis.pendingPayouts.queuedUsd)} queued`}
          />
        ) : null}
        {kpis.newUsers ? (
          <KpiCard label="New users · 7 days" value={kpis.newUsers.value.toLocaleString()} delta={kpis.newUsers.delta} deltaSuffix="week over week" />
        ) : null}
      </div>

      {/* Attention queues */}
      {queues.kyc !== undefined ||
      queues.disputes !== undefined ||
      queues.aml !== undefined ||
      queues.payouts !== undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {queues.kyc !== undefined ? (
            <QueueCard label="KYC" icon={<ShieldCheck className="size-4" />} count={queues.kyc} unit="submissions pending" href="/kyc" tone="blue" />
          ) : null}
          {queues.disputes !== undefined ? (
            <QueueCard label="Disputes" icon={<Gavel className="size-4" />} count={queues.disputes} unit="cases open" href="/disputes" tone="violet" />
          ) : null}
          {queues.aml !== undefined ? (
            <QueueCard label="AML" icon={<ShieldAlert className="size-4" />} count={queues.aml} unit="alerts to review" href="/aml" tone="rose" />
          ) : null}
          {queues.payouts !== undefined ? (
            <QueueCard label="Payouts" icon={<Wallet className="size-4" />} count={queues.payouts} unit="need action" href="/wallets" tone="amber" />
          ) : null}
        </div>
      ) : null}

      {/* Charts */}
      {charts.gmvTrend || charts.signups ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {charts.gmvTrend ? (
            <ChartCard title="GMV trend · 6 months" hint="USD equivalent">
              <AreaChart points={charts.gmvTrend} />
            </ChartCard>
          ) : null}
          {charts.signups ? (
            <ChartCard title="Sign-ups · weekly" hint="last 12 weeks">
              <BarChart points={charts.signups} />
            </ChartCard>
          ) : null}
        </div>
      ) : null}

      {/* Recent activity */}
      {activity.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Recent admin activity
            </p>
            <Link href="/audit" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:opacity-80">
              Full audit log <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <ul>
            {activity.map((row) => (
              <ActivityItem key={row.id} row={row} />
            ))}
          </ul>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ cards */

function KpiCard({
  label,
  value,
  delta,
  deltaSuffix,
  deltaAbsolute,
  note,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  deltaAbsolute?: boolean;
  note?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink">{value}</p>
      {delta !== undefined ? (
        <p className={cn('mt-1 flex items-center gap-1 text-xs font-medium', up ? 'text-positive' : 'text-negative')}>
          {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
          {deltaAbsolute ? `${up ? '+' : ''}${delta}` : `${up ? '▲' : '▼'} ${Math.abs(delta)}%`} {deltaSuffix}
        </p>
      ) : note ? (
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}

const QUEUE_TONE: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
};

function QueueCard({
  label,
  icon,
  count,
  unit,
  href,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  unit: string;
  href: string;
  tone: string;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-2">
        <span className={cn('flex size-7 items-center justify-center rounded-lg', QUEUE_TONE[tone])}>{icon}</span>
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-ink">{count}</span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:opacity-80"
      >
        Open queue <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
        <p className="text-[11px] text-muted-foreground/70">{hint}</p>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ActivityItem({ row }: { row: ActivityRow }) {
  const ok = row.result === 'SUCCESS';
  return (
    <li className="flex items-center gap-3 border-b border-hairline px-6 py-3.5 last:border-b-0">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{relTime(row.createdAt)}</span>
      <span className="w-36 shrink-0 truncate text-sm font-semibold text-ink">{row.actorName}</span>
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {row.action}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{row.target}</span>
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
          ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800',
        )}
      >
        {row.result}
      </span>
    </li>
  );
}

/* ----------------------------------------------------------------- charts */

function AreaChart({ points }: { points: TrendPoint[] }) {
  const width = 100;
  const height = 40;
  const max = Math.max(...points.map((point) => point.value), 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((point, index) => ({
    x: index * step,
    y: height - (point.value / max) * (height - 4) - 2,
  }));
  const line = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x},${coord.y}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-40 w-full">
        <defs>
          <linearGradient id="gmvArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#gmvArea)" />
        <path d={line} fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex justify-between">
        {points.map((point, index) => (
          <span key={index} className="text-[10px] text-muted-foreground/70">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <div className="flex h-40 items-end gap-1.5">
      {points.map((point, index) => {
        const last = index === points.length - 1;
        return (
          <div key={index} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-1 items-end">
              <div
                className={cn('w-full rounded-t', last ? 'bg-brand-600' : 'bg-ink/85')}
                style={{ height: `${Math.max((point.value / max) * 100, 2)}%` }}
                title={`${point.value}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- format */

function usd(amount: number, compact = false): string {
  if (compact && Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  }
  if (compact && Math.abs(amount) >= 10_000) {
    return `$${(amount / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}K`;
  }
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function relTime(iso: string): string {
  const date = new Date(iso);
  const sameDay = new Date().toDateString() === date.toDateString();
  if (sameDay) return `Today, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
