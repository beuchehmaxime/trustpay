'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChartColumnBig,
  ChartLine,
  Download,
  FileText,
  Loader2,
  Lock,
} from 'lucide-react';

import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import {
  useAnalyticsOverview,
  useGenerateReport,
  useRecentReports,
} from '@/features/analytics/hooks';
import type { Kpi, ReportType, TrendPoint } from '@/features/analytics/types';

const TIER_LABEL = ['Unverified', 'Basic', 'Verified', 'Enhanced'];

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  INVITED: 'Invited',
  UNDER_REVIEW: 'Under review',
  SIGNED: 'Signed',
  FUNDED: 'Funded',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DISPUTED: 'Disputed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const REPORTS: { type: ReportType; name: string; hint: string }[] = [
  { type: 'DAILY_TRANSACTION_SUMMARY', name: 'Transaction summary', hint: 'All escrow movements · last 30 days' },
  { type: 'EARNINGS_TAX', name: 'Earnings & tax', hint: 'Platform fees collected · last 12 months' },
  { type: 'GMV_ANALYTICS', name: 'GMV analytics', hint: 'GMV, revenue and volume · last 6 months' },
  { type: 'KYC_COVERAGE', name: 'KYC coverage', hint: 'Verification status breakdown' },
  { type: 'MONTHLY_AML', name: 'Monthly AML', hint: 'Every AML / sanctions alert' },
  { type: 'SUSPICIOUS_ACTIVITY', name: 'Suspicious activity (SAR)', hint: 'Sanctions matches & escalated cases' },
];

const DATE_PRESETS: { value: string; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: '6m', label: '6 months' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];

/**
 * Resolve a preset (or custom inputs) into a concrete from/to range. Boundaries
 * are UTC-aligned so they match the backend's UTC bucketing (avoids a leading
 * bucket from the prior period on tz-offset clients).
 */
function resolveRange(preset: string, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  switch (preset) {
    case 'today':
      return { from: new Date(Date.UTC(year, month, day)), to: now };
    case 'week': {
      const daysSinceMonday = (now.getUTCDay() + 6) % 7; // Monday = start of week
      return { from: new Date(Date.UTC(year, month, day - daysSinceMonday)), to: now };
    }
    case 'month':
      return { from: new Date(Date.UTC(year, month, 1)), to: now };
    case 'year':
      // Whole calendar year → all 12 months (future months show empty).
      return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) };
    case 'custom': {
      const from = customFrom ? new Date(`${customFrom}T00:00:00Z`) : new Date(Date.UTC(year, month - 5, 1));
      const to = customTo ? new Date(`${customTo}T23:59:59Z`) : now;
      return { from, to };
    }
    default:
      return { from: new Date(Date.UTC(year, month - 5, 1)), to: now };
  }
}

const usdCompact = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: amount >= 100000 ? 'compact' : 'standard',
    maximumFractionDigits: amount >= 100000 ? 1 : 0,
  }).format(amount);

const num = (value: number) => value.toLocaleString('en-US');

function reportTypeLabel(type: string): string {
  return REPORTS.find((report) => report.type === type)?.name ?? type;
}

/** Evenly-spaced axis tick indices (including first and last), deduped. */
function evenTicks(length: number, count: number): number[] {
  if (length <= 1) return [0];
  const ticks = Math.min(count, length);
  const indices = Array.from({ length: ticks }, (_, position) =>
    Math.round((position / (ticks - 1)) * (length - 1)),
  );
  return [...new Set(indices)];
}

export default function ReportsPage() {
  const canView = usePermission('reports.view');
  const canExport = usePermission('reports.export');
  const [tab, setTab] = useState<'analytics' | 'reports'>('analytics');
  const [preset, setPreset] = useState('6m');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');

  const { from, to } = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  const { data, isLoading, isError, error, isFetching } = useAnalyticsOverview(
    from.toISOString(),
    to.toISOString(),
  );
  const { data: recent } = useRecentReports(canView);
  const generate = useGenerateReport();

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You don’t have permission to view reports &amp; analytics.
        </p>
      </div>
    );
  }

  async function onGenerate(type: ReportType, name: string) {
    try {
      const result = await generate.mutateAsync(type);
      const blob = new Blob([result.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${name} exported`);
    } catch (generateError) {
      toast.error('Could not generate report', {
        description: normaliseError(generateError).message,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider text-brand-600 uppercase">BiZik Admin</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Reports &amp; analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Platform analytics and regulatory exports.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-hairline">
        <TabButton active={tab === 'analytics'} onClick={() => setTab('analytics')}>
          Analytics
        </TabButton>
        <TabButton active={tab === 'reports'} onClick={() => setTab('reports')}>
          Reports &amp; exports
        </TabButton>
      </div>

      {tab === 'analytics' ? (
        <>
          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-hairline bg-surface p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <select
              value={preset}
              onChange={(event) => setPreset(event.target.value)}
              className="h-10 rounded-lg border border-field bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            >
              {DATE_PRESETS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {preset === 'custom' ? (
              <>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="h-10 rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="h-10 rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
                />
              </>
            ) : null}
            <span className="inline-flex h-10 items-center rounded-lg border border-field bg-white px-3 text-sm font-medium text-muted-foreground">
              USD equivalent
            </span>
            {isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-field bg-white p-0.5">
              <ChartToggle active={chartType === 'bar'} onClick={() => setChartType('bar')} icon={ChartColumnBig} label="Bar" />
              <ChartToggle active={chartType === 'line'} onClick={() => setChartType('line')} icon={ChartLine} label="Line" />
            </div>
          </div>

          {isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {normaliseError(error).message}
            </div>
          ) : isLoading || !data ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* KPIs with deltas */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KpiCard label="GMV" kpi={data.kpis.gmv} format={usdCompact} goodWhenUp />
                <KpiCard label="Revenue" kpi={data.kpis.revenue} format={usdCompact} goodWhenUp />
                <KpiCard label="Transactions" kpi={data.kpis.transactions} format={num} goodWhenUp />
                <KpiCard label="New users" kpi={data.kpis.newUsers} format={num} goodWhenUp />
                <KpiCard
                  label="Dispute rate"
                  kpi={data.kpis.disputeRate}
                  format={(value) => `${value.toFixed(1)}%`}
                  goodWhenUp={false}
                />
              </div>

              {/* Trends */}
              <div className="grid gap-5 lg:grid-cols-2">
                <ChartCard type={chartType} title="GMV" subtitle="Released volume" data={data.trends.gmv} total={usdCompact(data.kpis.gmv.value)} money />
                <ChartCard type={chartType} title="Revenue" subtitle="Fees collected" data={data.trends.revenue} total={usdCompact(data.kpis.revenue.value)} money />
                <ChartCard type={chartType} title="New users" subtitle="Signups" data={data.trends.users} total={num(data.kpis.newUsers.value)} />
                <ChartCard type={chartType} title="Transactions" subtitle="Escrow movements" data={data.trends.transactions} total={num(data.kpis.transactions.value)} />
              </div>

              {/* Breakdowns */}
              <div className="grid gap-5 lg:grid-cols-2">
                <BreakdownCard title="Revenue by fee type">
                  {data.breakdowns.revenueByType.length === 0 ? (
                    <Empty />
                  ) : (
                    data.breakdowns.revenueByType.map((row) => (
                      <Row key={row.type} label={row.label} value={usdCompact(row.usd)} />
                    ))
                  )}
                </BreakdownCard>
                <BreakdownCard title="GMV by currency">
                  {data.breakdowns.gmvByCurrency.length === 0 ? (
                    <Empty />
                  ) : (
                    data.breakdowns.gmvByCurrency.map((row) => (
                      <Row
                        key={row.currency}
                        label={row.currency}
                        value={new Intl.NumberFormat('en-US', { style: 'currency', currency: row.currency }).format(row.amount)}
                        sub={`${row.count} release${row.count === 1 ? '' : 's'}`}
                      />
                    ))
                  )}
                </BreakdownCard>
                <BreakdownCard title="Deals by status">
                  {data.breakdowns.projectsByStatus.map((row) => (
                    <Row key={row.status} label={STATUS_LABEL[row.status] ?? row.status} value={num(row.count)} />
                  ))}
                </BreakdownCard>
                <BreakdownCard title="Users by KYC tier">
                  {data.breakdowns.usersByTier.map((row) => (
                    <Row key={row.tier} label={TIER_LABEL[row.tier] ?? `Tier ${row.tier}`} value={num(row.count)} />
                  ))}
                </BreakdownCard>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Financial, tax &amp; regulatory reports
            </p>
            {!canExport ? (
              <span className="text-xs text-muted-foreground">Export permission required</span>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {REPORTS.map((report) => (
              <div key={report.type} className="flex flex-col justify-between rounded-lg border border-hairline p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <FileText className="size-4" />
                    </span>
                    <p className="text-sm font-semibold text-ink">{report.name}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{report.hint}</p>
                </div>
                <button
                  type="button"
                  disabled={!canExport || generate.isPending}
                  onClick={() => onGenerate(report.type, report.name)}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-field bg-white px-3 py-2 text-xs font-medium text-ink transition hover:bg-muted disabled:opacity-50"
                >
                  {generate.isPending && generate.variables === report.type ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5 text-muted-foreground" />
                  )}
                  Generate CSV
                </button>
              </div>
            ))}
          </div>

          <p className="mt-6 mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Recently generated
          </p>
          {!recent || recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports generated yet.</p>
          ) : (
            <div className="space-y-1.5">
              {recent.map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-ink">{reportTypeLabel(row.type)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {row.format} · by {row.generatedBy}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString('en-GB')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChartCard({
  type,
  title,
  subtitle,
  data,
  total,
  money,
}: {
  type: 'bar' | 'line';
  title: string;
  subtitle: string;
  data: TrendPoint[];
  total: string;
  money?: boolean;
}) {
  const max = Math.max(1, ...data.map((point) => point.value));
  const fmt = (value: number) => (money ? usdCompact(value) : num(value));
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {title}
          </p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <p className="text-lg font-bold text-ink">{total}</p>
      </div>

      <div className="mt-4 h-40">
        {type === 'bar' ? (
          <div className="flex h-full items-stretch gap-1.5">
            {data.map((point, index) => (
              <div key={index} className="group flex flex-1 items-end">
                <div
                  className={cn(
                    'w-full rounded-t transition-all',
                    point.value > 0
                      ? 'bg-linear-to-t from-brand-600 to-brand-400 group-hover:from-brand-700'
                      : 'bg-hairline',
                  )}
                  style={{ height: `${point.value > 0 ? Math.max(4, Math.round((point.value / max) * 100)) : 2}%` }}
                  title={`${point.label}: ${fmt(point.value)}`}
                />
              </div>
            ))}
          </div>
        ) : (
          <LineSvg data={data} max={max} chartId={title.replace(/\s+/g, '')} />
        )}
      </div>

      {data.length <= 12 ? (
        <div className="mt-1.5 flex gap-1.5">
          {data.map((point, index) => (
            <span key={index} className="flex-1 whitespace-nowrap text-center text-[10px] text-muted-foreground">
              {point.label}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          {evenTicks(data.length, 7).map((index) => (
            <span key={index} className="whitespace-nowrap">
              {data[index].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function LineSvg({ data, max, chartId }: { data: TrendPoint[]; max: number; chartId: string }) {
  const count = data.length;
  const cx = (index: number) => ((index + 0.5) / count) * 100;
  const cy = (value: number) => 100 - (value / max) * 96 - 2;
  const line = data.map((point, index) => `${cx(index)},${cy(point.value)}`).join(' ');
  const area = `${cx(0)},100 ${line} ${cx(count - 1)},100`;
  const gradientId = `area-${chartId}`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(20 91 150 / 0.22)" />
          <stop offset="100%" stopColor="rgb(20 91 150 / 0)" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="#145b96"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ChartToggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} chart`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-ink',
      )}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

function KpiCard({
  label,
  kpi,
  format,
  goodWhenUp,
}: {
  label: string;
  kpi: Kpi;
  format: (value: number) => string;
  goodWhenUp: boolean;
}) {
  const up = kpi.delta > 0;
  const down = kpi.delta < 0;
  const good = kpi.delta === 0 ? null : goodWhenUp ? up : down;
  const deltaText =
    kpi.deltaUnit === 'pts' ? `${Math.abs(kpi.delta)} pts` : `${Math.abs(kpi.delta)}%`;
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink tabular-nums">{format(kpi.value)}</p>
      {kpi.delta === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">no change vs prev.</p>
      ) : (
        <p
          className={cn(
            'mt-1 inline-flex items-center gap-0.5 text-xs font-medium',
            good ? 'text-positive' : 'text-negative',
          )}
        >
          {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          {deltaText} vs prev.
        </p>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 pb-3 text-sm font-semibold transition-colors',
        active ? 'border-brand-500 text-ink' : 'border-transparent text-muted-foreground hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function BreakdownCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="mb-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink">{label}</span>
      <span className="text-right">
        <span className="font-semibold text-ink tabular-nums">{value}</span>
        {sub ? <span className="ml-2 text-xs text-muted-foreground">{sub}</span> : null}
      </span>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">No data in this range.</p>;
}
