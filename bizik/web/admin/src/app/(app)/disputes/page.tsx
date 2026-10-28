'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Gavel, Loader2, Lock } from 'lucide-react';

import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDisputeStats, useDisputes } from '@/features/disputes/hooks';
import { DisputeStatusBadge, money } from '@/features/disputes/disputes-ui';
import type { DisputeStatusValue } from '@/features/disputes/types';

const STATUS_OPTIONS: { value: DisputeStatusValue | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'FILED', label: 'Filed' },
  { value: 'AWAITING_RESPONSE', label: 'Awaiting response' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'ESCALATED', label: 'Escalated' },
  { value: 'RESOLVED', label: 'Resolved' },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function DisputesPage() {
  const canView = usePermission('disputes.view');
  const [status, setStatus] = useState<DisputeStatusValue | ''>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isError, error } = useDisputes({
    status: status || undefined,
    page,
    pageSize,
  });
  const { data: stats } = useDisputeStats();

  const disputes = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasNext = page * pageSize < total;

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You don’t have permission to view disputes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase">
          <span className="text-muted-foreground">Trust &amp; safety</span>{' '}
          <span className="text-ink">Disputes</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Disputes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review dispute evidence, assign mediators and issue binding rulings (release, refund or
          split).
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats?.total} />
        <StatCard label="Open" value={stats?.open} note="need mediation" tone="warning" />
        <StatCard label="Escalated" value={stats?.escalated} note="senior review" tone="negative" />
        <StatCard label="Resolved" value={stats?.resolved} note="closed" tone="positive" />
      </div>

      {/* Filters + table */}
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-col gap-2.5 border-b border-hairline px-6 py-4 lg:flex-row lg:items-center lg:justify-end">
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as DisputeStatusValue | '');
              setPage(1);
            }}
            className="h-10 rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 lg:w-52"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {isError ? (
          <div className="p-6 text-sm text-destructive">{normaliseError(error).message}</div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : disputes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Gavel className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No disputes match your filters.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <HeaderCell>Case</HeaderCell>
                  <HeaderCell>Reason</HeaderCell>
                  <HeaderCell>Amount</HeaderCell>
                  <HeaderCell>Mediator</HeaderCell>
                  <HeaderCell>Status</HeaderCell>
                  <HeaderCell>Filed</HeaderCell>
                  <HeaderCell className="text-right">Review</HeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {disputes.map((dispute) => (
                  <TableRow key={dispute.id} className="hover:bg-muted/40">
                    <TableCell className="py-4">
                      <div className="font-semibold text-ink">{dispute.contractTitle}</div>
                      <div className="text-xs text-muted-foreground">{dispute.milestoneTitle}</div>
                    </TableCell>
                    <TableCell className="text-ink">{dispute.reasonLabel}</TableCell>
                    <TableCell className="font-medium text-ink">
                      {money(dispute.amount, dispute.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dispute.mediatorName ?? <span className="text-amber-700">Unassigned</span>}
                    </TableCell>
                    <TableCell>
                      <DisputeStatusBadge status={dispute.status} label={dispute.statusLabel} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(dispute.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/disputes/${dispute.id}`}
                        className="inline-flex items-center gap-1 font-medium text-brand-600 hover:opacity-80"
                      >
                        Review <ArrowRight className="size-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-hairline px-6 py-3 text-sm text-muted-foreground">
              <span>
                {total} dispute{total === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="rounded-lg border border-field px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-muted disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={!hasNext}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-lg border border-field px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-muted disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </>
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
  tone?: 'warning' | 'negative' | 'positive' | 'muted';
}) {
  const toneClass =
    tone === 'warning'
      ? 'text-warning'
      : tone === 'negative'
        ? 'text-negative'
        : tone === 'positive'
          ? 'text-positive'
          : 'text-muted-foreground';
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink">{value ?? '-'}</p>
      {note ? <p className={cn('mt-1 text-xs font-medium', toneClass)}>{note}</p> : null}
    </div>
  );
}

function HeaderCell({ children, className }: { children: React.ReactNode; className?: string }) {
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
