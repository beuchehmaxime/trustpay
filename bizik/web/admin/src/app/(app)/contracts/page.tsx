'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileStack, FolderKanban, Loader2, Lock, Search } from 'lucide-react';

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
import { useProjects, useProjectStats } from '@/features/projects/hooks';
import { ContractStatusBadge, money } from '@/features/projects/projects-ui';
import type { ContractStatusValue } from '@/features/projects/types';

const STATUS_OPTIONS: { value: ContractStatusValue | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'INVITED', label: 'Invited' },
  { value: 'SIGNED', label: 'Signed' },
  { value: 'FUNDED', label: 'Funded' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'DISPUTED', label: 'Disputed' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const CURRENCY_OPTIONS = ['', 'USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF'];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function ProjectsPage() {
  const canView = usePermission('contracts.view');
  const canManageTemplates = usePermission('templates.manage');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContractStatusValue | ''>('');
  const [currency, setCurrency] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isError, error } = useProjects({
    search: search || undefined,
    status: status || undefined,
    currency: currency || undefined,
    page,
    pageSize,
  });
  const { data: stats } = useProjectStats();

  const projects = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasNextPage = page * pageSize < total;

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You don’t have permission to view deals.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider uppercase">
            <span className="text-muted-foreground">Commerce</span>{' '}
            <span className="text-ink">Deals</span>
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Deals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Oversee every contract, milestone and deliverable; force-cancel or complete, and manage
            templates.
          </p>
        </div>
        {canManageTemplates ? (
          <Link
            href="/contracts/templates"
            className="inline-flex items-center gap-2 rounded-lg border border-field bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-muted"
          >
            <FileStack className="size-4 text-muted-foreground" /> Manage templates
          </Link>
        ) : null}
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total" value={stats?.total} />
        <StatCard label="Active" value={stats?.active} note="in flight" tone="brand" />
        <StatCard label="Disputed" value={stats?.disputed} note="frozen" tone="negative" />
        <StatCard label="Completed" value={stats?.completed} note="paid out" tone="positive" />
        <StatCard label="Cancelled" value={stats?.cancelled} note="refunded" tone="muted" />
      </div>

      {/* Filters + table */}
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-col gap-2.5 border-b border-hairline px-6 py-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by title, ID or party…"
              className="h-10 w-full rounded-lg border border-field bg-white pr-3 pl-10 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
          <FilterSelect
            value={status}
            onChange={(value) => {
              setStatus(value as ContractStatusValue | '');
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            value={currency}
            onChange={(value) => {
              setCurrency(value);
              setPage(1);
            }}
          >
            {CURRENCY_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code === '' ? 'All currencies' : code}
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
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <FolderKanban className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No contracts match your filters.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <HeaderCell>Deal</HeaderCell>
                  <HeaderCell>Parties</HeaderCell>
                  <HeaderCell>Value</HeaderCell>
                  <HeaderCell>Milestones</HeaderCell>
                  <HeaderCell>Status</HeaderCell>
                  <HeaderCell>Created</HeaderCell>
                  <HeaderCell className="text-right">View</HeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => {
                  const creatorName = project.creator?.fullName ?? 'Unknown';
                  return (
                    <TableRow key={project.id} className="hover:bg-muted/40">
                      <TableCell className="py-4">
                        <div className="font-semibold text-ink">{project.title}</div>
                        <div className="font-mono text-xs text-muted-foreground">{project.id}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                              avatarColor(creatorName),
                            )}
                          >
                            {initials(creatorName)}
                          </span>
                          <div className="min-w-0 text-xs">
                            <div className="truncate text-ink">{creatorName}</div>
                            <div className="truncate text-muted-foreground">
                              ↔ {project.counterparty?.fullName ?? '-'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-ink">
                        {money(project.totalAmount, project.currency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {project.milestonesReleased}/{project.milestoneCount} released
                      </TableCell>
                      <TableCell>
                        <ContractStatusBadge status={project.status} label={project.statusLabel} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(project.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/contracts/${project.id}`}
                          className="inline-flex items-center gap-1 font-medium text-brand-600 hover:opacity-80"
                        >
                          View <ArrowRight className="size-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-hairline px-6 py-3 text-sm text-muted-foreground">
              <span>
                {total} contract{total === 1 ? '' : 's'}
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
                    disabled={!hasNextPage}
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
  tone?: 'brand' | 'positive' | 'negative' | 'muted';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : tone === 'brand'
          ? 'text-brand-600'
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
