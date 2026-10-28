'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Lock, Search } from 'lucide-react';

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
import { useKycQueue } from '@/features/kyc/hooks';
import {
  FlagBadge,
  KycStatusBadge,
  idTypeLabel,
  scoreDisplay,
} from '@/features/kyc/kyc-ui';
import type { KycStatusValue } from '@/features/kyc/types';

const STATUS_OPTIONS: { value: KycStatusValue | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'APPROVED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
];

export default function KycQueuePage() {
  const canView = usePermission('kyc.view');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<KycStatusValue | ''>('');
  const [country, setCountry] = useState('');
  const [idType, setIdType] = useState('');

  const { data, isLoading, isError, error } = useKycQueue({
    search: search || undefined,
    status: status || undefined,
    country: country || undefined,
    idType: idType || undefined,
  });
  const queue = data ?? [];

  // The queue is small, so the loaded set drives the filter dropdown options.
  const { countries, idTypes } = useMemo(() => {
    const countrySet = new Set<string>();
    const idTypeSet = new Set<string>();
    for (const item of data ?? []) {
      if (item.user?.country) countrySet.add(item.user.country);
      if (item.idType) idTypeSet.add(item.idType);
    }
    return {
      countries: [...countrySet].sort(),
      idTypes: [...idTypeSet].sort(),
    };
  }, [data]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You don’t have permission to view the KYC queue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase">
          <span className="text-muted-foreground">Trust &amp; safety</span>{' '}
          <span className="text-ink">KYC review</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">KYC review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Identity submissions awaiting a compliance decision.
        </p>
      </div>

      {/* Combined filters + table */}
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-col gap-2.5 border-b border-hairline px-6 py-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search applicant…"
              className="h-10 w-full rounded-lg border border-field bg-white pr-3 pl-10 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
          <FilterSelect value={status} onChange={(value) => setStatus(value as KycStatusValue | '')}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={country} onChange={setCountry}>
            <option value="">All countries</option>
            {countries.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={idType} onChange={setIdType}>
            <option value="">All ID types</option>
            {idTypes.map((type) => (
              <option key={type} value={type}>
                {idTypeLabel(type)}
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
        ) : queue.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            No submissions match your filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <HeaderCell>Applicant</HeaderCell>
                <HeaderCell>Country</HeaderCell>
                <HeaderCell>ID type</HeaderCell>
                <HeaderCell>Liveness</HeaderCell>
                <HeaderCell>Match</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell className="text-right">Review</HeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item) => {
                const applicantName = item.user?.fullName ?? 'Unknown applicant';
                const flags = item.reviewItems.filter((flag) => !flag.resolved).length;
                const liveness = scoreDisplay(item.selfieScore);
                const match = scoreDisplay(item.matchScore);
                return (
                  <TableRow key={item.id} className="hover:bg-muted/40">
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                            avatarColor(applicantName),
                          )}
                        >
                          {initials(applicantName)}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-ink">{applicantName}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {item.user?.email ?? '-'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-ink">{item.user?.country ?? '-'}</TableCell>
                    <TableCell className="text-ink">{idTypeLabel(item.idType)}</TableCell>
                    <TableCell className={liveness.className}>{liveness.text}</TableCell>
                    <TableCell className={match.className}>{match.text}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <KycStatusBadge status={item.status} label={item.statusLabel} />
                        <FlagBadge count={flags} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/kyc/${item.id}`}
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
