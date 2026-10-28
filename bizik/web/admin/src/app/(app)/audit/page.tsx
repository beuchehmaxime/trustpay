'use client';

import { useState } from 'react';
import { Download, Loader2, Lock, ScrollText, Search } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { STATUS_TONE } from '@/lib/status-tone';
import { useAuditFilters, useAuditLog } from '@/features/audit/hooks';
import type { AuditEntry } from '@/features/audit/types';

const DATE_OPTIONS: { value: string; label: string }[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '', label: 'All time' },
];

function formatWhen(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${time}`;
}

export default function AuditPage() {
  const canView = usePermission('audit.view');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [days, setDays] = useState('7');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const pageSize = 25;

  const { data, isLoading, isError, error } = useAuditLog({
    search: search || undefined,
    action: action || undefined,
    actorId: actorId || undefined,
    days: days ? Number(days) : undefined,
    page,
    pageSize,
  });
  const { data: filterOptions } = useAuditFilters();

  const entries = data?.items ?? [];
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
          You don’t have permission to view the audit log.
        </p>
      </div>
    );
  }

  function exportCsv() {
    const headers = ['Timestamp', 'Actor', 'Role', 'Action', 'Target', 'IP', 'Result'];
    const lines = entries.map((entry) =>
      [
        entry.createdAt,
        entry.actor.name,
        entry.actor.role,
        entry.action,
        entry.target,
        entry.ipAddress ?? '',
        entry.result,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bizik-audit-log.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider text-brand-600 uppercase">BiZik Admin</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Immutable record of every admin action and security event.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {/* Filters */}
        <div className="flex flex-col gap-2.5 border-b border-hairline px-6 py-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search actor, action or target…"
              className="h-10 w-full rounded-lg border border-field bg-white pr-3 pl-10 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
          <FilterSelect
            value={actorId}
            onChange={(value) => {
              setActorId(value);
              setPage(1);
            }}
          >
            <option value="">All actors</option>
            {(filterOptions?.actors ?? []).map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            value={action}
            onChange={(value) => {
              setAction(value);
              setPage(1);
            }}
          >
            <option value="">All actions</option>
            {(filterOptions?.actions ?? []).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            value={days}
            onChange={(value) => {
              setDays(value);
              setPage(1);
            }}
          >
            {DATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FilterSelect>
          <button
            type="button"
            onClick={exportCsv}
            disabled={entries.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-field bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-muted disabled:opacity-50"
          >
            <Download className="size-4 text-muted-foreground" /> Export CSV
          </button>
        </div>

        {isError ? (
          <div className="p-6 text-sm text-destructive">{normaliseError(error).message}</div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <ScrollText className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No audit entries match your filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-hairline text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    <th className="px-6 py-3">Timestamp</th>
                    <th className="py-3">Actor</th>
                    <th className="py-3">Action</th>
                    <th className="py-3">Target</th>
                    <th className="py-3">IP</th>
                    <th className="py-3">Result</th>
                    <th className="py-3 pr-6 text-right">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-hairline last:border-0 hover:bg-muted/40">
                      <td className="whitespace-nowrap px-6 py-3.5 text-muted-foreground">
                        {formatWhen(entry.createdAt)}
                      </td>
                      <td className="py-3.5">
                        <div className="font-semibold text-ink">{entry.actor.name}</div>
                        <div className="text-xs text-muted-foreground">{entry.actor.role}</div>
                      </td>
                      <td className="py-3.5">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-slate-700 uppercase">
                          {entry.action}
                        </span>
                      </td>
                      <td className="py-3.5 text-ink">{entry.target}</td>
                      <td className="py-3.5 font-mono text-xs text-muted-foreground">
                        {entry.ipAddress ?? '-'}
                      </td>
                      <td className="py-3.5">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
                            entry.result === 'SUCCESS' ? STATUS_TONE.positive : STATUS_TONE.negative,
                          )}
                        >
                          {entry.result}
                        </span>
                      </td>
                      <td className="py-3.5 pr-6 text-right">
                        <button
                          type="button"
                          onClick={() => setDetail(entry)}
                          className="font-medium text-brand-600 hover:opacity-80"
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-hairline px-6 py-3 text-sm text-muted-foreground">
              <span>
                {total} event{total === 1 ? '' : 's'}
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

      <AuditDetailDialog entry={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function AuditDetailDialog({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  if (!entry) return null;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">
            <span className="font-mono text-sm">{entry.action}</span>
          </DialogTitle>
          <DialogDescription>
            {entry.actor.name} ({entry.actor.role}) · {new Date(entry.createdAt).toLocaleString('en-GB')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailField label="Target" value={entry.target} />
            <DetailField
              label="Result"
              value={entry.result}
              tone={entry.result === 'SUCCESS' ? 'positive' : 'negative'}
            />
            <DetailField label="Entity" value={`${entry.entityType}${entry.entityId ? ` · ${entry.entityId}` : ''}`} />
            <DetailField label="IP address" value={entry.ipAddress ?? '-'} />
          </div>
          {entry.userAgent ? <DetailField label="User agent" value={entry.userAgent} /> : null}
          {entry.before || entry.after ? (
            <div className="space-y-2">
              {entry.before ? (
                <StatePanel label="Before" state={entry.before} />
              ) : null}
              {entry.after ? <StatePanel label="After" state={entry.after} /> : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
}) {
  const toneClass = tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink';
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={cn('mt-0.5 wrap-break-word text-sm font-medium', toneClass)}>{value}</p>
    </div>
  );
}

function StatePanel({ label, state }: { label: string; state: unknown }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <pre className="max-h-40 overflow-auto rounded-lg bg-muted/60 p-3 text-xs text-ink">
        {JSON.stringify(state, null, 2)}
      </pre>
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
      className="h-10 rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 lg:w-40"
    >
      {children}
    </select>
  );
}
