'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Lock, Search, ShieldAlert } from 'lucide-react';

import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { avatarColor, initials } from '@/lib/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAmlAlerts, useAmlStats } from '@/features/aml/hooks';
import { AccountStatusPill, AmlStatusBadge, AmlTypeBadge } from '@/features/aml/aml-ui';
import type { AmlAlertStatusValue, AmlAlertTypeValue } from '@/features/aml/types';

const STATUS_OPTIONS: { value: AmlAlertStatusValue | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'ESCALATED', label: 'Escalated' },
  { value: 'CLEARED', label: 'Cleared' },
];

const TYPE_OPTIONS: { value: AmlAlertTypeValue | ''; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'SANCTIONS_MATCH', label: 'Sanctions match' },
  { value: 'PEP_MATCH', label: 'PEP match' },
  { value: 'STRUCTURING', label: 'Structuring' },
  { value: 'HIGH_RISK_FLOW', label: 'High-risk flow' },
  { value: 'VELOCITY_ANOMALY', label: 'Velocity anomaly' },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function AmlAlertsPage() {
  const canView = usePermission('aml.view');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AmlAlertStatusValue | ''>('');
  const [type, setType] = useState<AmlAlertTypeValue | ''>('');

  const { data, isLoading, isError, error } = useAmlAlerts({
    search: search || undefined,
    status: status || undefined,
    type: type || undefined,
  });
  const { data: stats } = useAmlStats();
  const alerts = data ?? [];

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You don’t have permission to view AML &amp; sanctions alerts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase">
          <span className="text-muted-foreground">Trust &amp; safety</span>{' '}
          <span className="text-ink">AML &amp; sanctions</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">AML &amp; sanctions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review AML, PEP and sanctions alerts, manage cases, freeze accounts and file reports.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open cases" value={stats?.open} note="need attention" tone="warning" />
        <StatCard label="New" value={stats?.new} note="unassigned" tone="muted" />
        <StatCard label="Escalated" value={stats?.escalated} note="to MLRO" tone="negative" />
        <StatCard label="Cleared" value={stats?.cleared} note="resolved" tone="positive" />
      </div>

      {/* Filters + table */}
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-col gap-2.5 border-b border-hairline px-6 py-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search subject name or email…"
              className="h-10 w-full rounded-lg border border-field bg-white pr-3 pl-10 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
          <FilterSelect value={status} onChange={(value) => setStatus(value as AmlAlertStatusValue | '')}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={type} onChange={(value) => setType(value as AmlAlertTypeValue | '')}>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FilterSelect>
        </div>

        {isError ? (
          <div className="p-6 text-sm text-destructive">{normaliseError(error).message}</div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <ShieldAlert className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No alerts match your filters.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <HeaderCell>Subject</HeaderCell>
                <HeaderCell>Alert type</HeaderCell>
                <HeaderCell>Country</HeaderCell>
                <HeaderCell>Account</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Raised</HeaderCell>
                <HeaderCell className="text-right">Review</HeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((alert) => {
                const subjectName = alert.user?.fullName ?? 'Unknown subject';
                return (
                  <TableRow key={alert.id} className="hover:bg-muted/40">
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                            avatarColor(subjectName),
                          )}
                        >
                          {initials(subjectName)}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-ink">{subjectName}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {alert.user?.email ?? '-'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <AmlTypeBadge type={alert.type} label={alert.typeLabel} />
                    </TableCell>
                    <TableCell className="text-ink">{alert.user?.country ?? '-'}</TableCell>
                    <TableCell>
                      {alert.user ? <AccountStatusPill status={alert.user.status} /> : '-'}
                    </TableCell>
                    <TableCell>
                      <AmlStatusBadge status={alert.status} label={alert.statusLabel} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(alert.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/aml/${alert.id}`}
                        className="inline-flex items-center gap-1 font-medium text-brand-600 hover:opacity-80"
                      >
                        Review <ArrowRight className="size-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  tone = 'muted',
}: {
  label: string;
  value?: number;
  note?: string;
  tone?: 'positive' | 'warning' | 'negative' | 'muted';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'negative'
          ? 'text-negative'
          : 'text-muted-foreground';
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink">{value ?? '-'}</p>
      {note ? <p className={cn('mt-1 text-xs font-medium', toneClass)}>{note}</p> : null}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 lg:w-44"
    >
      {children}
    </select>
  );
}

function HeaderCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(
        'text-[11px] font-semibold tracking-wider text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </TableHead>
  );
}
