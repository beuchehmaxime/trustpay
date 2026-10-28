'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Check, Clock, Search, ShieldAlert, ShieldCheck, SlidersHorizontal } from 'lucide-react';

import { StatusPill } from '@/components/ui/status-pill';
import { useDisputes } from '@/lib/hooks/use-disputes';
import type { DisputeListItem as ApiDisputeListItem } from '@/lib/api/disputes.api';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const GRID =
  'grid grid-cols-[minmax(220px,2.2fr)_minmax(120px,1.1fr)_minmax(110px,1fr)_minmax(110px,1fr)_minmax(160px,1.7fr)] items-center gap-3';

/** UI status buckets the design renders (tone + i18n label). */
type DisputeStatus = 'under_review' | 'resolved' | 'open';

const STATUS_TONE: Record<DisputeStatus, 'negative' | 'positive' | 'warning'> = {
  under_review: 'negative',
  resolved: 'positive',
  open: 'warning',
};

/** View model consumed by the card/row - mapped from the backend list item. */
interface DisputeListItem {
  id: string;
  milestoneTitle: string;
  filedByYou: boolean;
  filedAgo: string;
  dealName: string;
  counterparty: string;
  amount: number;
  currency: string;
  status: DisputeStatus;
  nextStepKey?: string;
  nextText?: string;
  deadline?: string;
  outcome?: string;
}

/** Map a raw backend status onto one of the three UI buckets. */
function toUiStatus(status: ApiDisputeListItem['status']): DisputeStatus {
  if (status === 'RESOLVED' || status === 'AUTO_RULED') return 'resolved';
  if (status === 'FILED') return 'open';
  return 'under_review';
}

/** Compact "N days ago" relative time from an ISO timestamp. */
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return days === 1 ? '1 day ago' : `${days} days ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return 'Just now';
}

/** Map a backend dispute list item onto the existing card/row view model. */
function toDisputeView(item: ApiDisputeListItem): DisputeListItem {
  const status = toUiStatus(item.status);
  return {
    id: item.id,
    milestoneTitle: item.milestoneTitle,
    filedByYou: item.filedByYou,
    filedAgo: relTime(item.createdAt),
    dealName: item.contractTitle,
    // The list endpoint returns no party name, so we surface the dispute reason.
    counterparty: item.reasonLabel,
    amount: item.amount,
    currency: item.currency,
    status,
    nextStepKey: status === 'resolved' ? undefined : 'disputes.next.addEvidence',
  };
}

type StatusFilter = 'all' | DisputeStatus;

export default function DisputesPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useDisputes();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filedByMeOnly, setFiledByMeOnly] = useState(false);

  const disputes = useMemo(() => (data ?? []).map(toDisputeView), [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return disputes.filter((dispute) => {
      if (statusFilter !== 'all' && dispute.status !== statusFilter) return false;
      if (filedByMeOnly && !dispute.filedByYou) return false;
      if (!query) return true;
      return `${dispute.id} ${dispute.milestoneTitle} ${dispute.dealName} ${dispute.counterparty}`
        .toLowerCase()
        .includes(query);
    });
  }, [disputes, search, statusFilter, filedByMeOnly]);

  const filterActive = statusFilter !== 'all' || filedByMeOnly;

  const toolbar = (
    <div className="flex items-center gap-2">
      <FilterMenu
        active={filterActive}
        status={statusFilter}
        setStatus={setStatusFilter}
        filedByMeOnly={filedByMeOnly}
        setFiledByMeOnly={setFiledByMeOnly}
      />
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('disputes.searchPlaceholder')}
          className="h-11 w-full rounded-full border border-hairline bg-[#F8FBFF] pl-9 pr-3 text-[13.5px] text-ink outline-none transition placeholder:text-subtle focus:border-brand-border"
        />
      </div>
    </div>
  );

  return (
    <div className="w-full">
      {/* Mobile: full-bleed white header (heading + subtitle + filter/search) */}
      <section className="-mx-4 -mt-4 bg-surface px-4 pb-4 pt-5 shadow-[0_10px_28px_-22px_rgba(11,31,58,0.35)] md:hidden">
        <h1 className="text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('disputes.title')}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t('disputes.subtitle')}</p>
        <div className="mt-4">{toolbar}</div>
      </section>

      {/* Desktop: subtitle + filter/search */}
      <div className="hidden space-y-5 md:block">
        <p className="text-[13px] text-muted-foreground">{t('disputes.subtitle')}</p>
        {toolbar}
      </div>

      {/* Content */}
      <div className="pt-4 md:pt-5">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState />
        ) : filtered.length === 0 ? (
          <EmptyState hasFilters={filterActive || search.trim().length > 0} />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="space-y-3 md:hidden">
              {filtered.map((dispute) => (
                <DisputeCard key={dispute.id} dispute={dispute} />
              ))}
            </div>

            {/* Desktop: table */}
            <section className="shadow-card hidden w-full overflow-hidden rounded-2xl border border-hairline bg-surface md:block">
              <div className="overflow-x-auto">
                <div className="min-w-[880px]">
                  <div className={cn(GRID, 'border-b border-hairline px-5 py-3')}>
                    {(['milestone', 'deal', 'amount', 'status', 'nextStep'] as const).map((col) => (
                      <span key={col} className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                        {t(`disputes.col.${col}`)}
                      </span>
                    ))}
                  </div>
                  {filtered.map((dispute) => (
                    <DisputeRow key={dispute.id} dispute={dispute} />
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Left filter control ─────────────────────────────────────────────────── */

function FilterMenu({
  active,
  status,
  setStatus,
  filedByMeOnly,
  setFiledByMeOnly,
}: {
  active: boolean;
  status: StatusFilter;
  setStatus: (value: StatusFilter) => void;
  filedByMeOnly: boolean;
  setFiledByMeOnly: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const statusOptions: StatusFilter[] = ['all', 'under_review', 'resolved'];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('disputes.filterLabel')}
        className={cn(
          'relative flex size-11 items-center justify-center rounded-full border transition',
          active || open
            ? 'border-brand-500 bg-brand-50 text-brand-700'
            : 'border-hairline bg-surface text-muted-foreground hover:border-brand-border hover:text-ink',
        )}
      >
        <SlidersHorizontal className="size-[18px]" />
        {active ? <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-brand-500 ring-2 ring-surface" /> : null}
      </button>

      {open ? (
        <div className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 absolute left-0 top-[calc(100%+8px)] z-30 w-64 rounded-2xl border border-hairline bg-surface p-2 shadow-[0_20px_44px_-16px_rgba(11,31,58,0.28)] duration-150">
          <p className="px-2.5 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-subtle">
            {t('disputes.filterStatus')}
          </p>
          {statusOptions.map((option) => {
            const selected = status === option;
            const label = option === 'all' ? t('disputes.filterAll') : t(`disputes.status.${option}`);
            return (
              <button
                key={option}
                type="button"
                onClick={() => setStatus(option)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-[14px] transition',
                  selected ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink hover:bg-muted',
                )}
              >
                {label}
                {selected ? <Check className="size-4" /> : null}
              </button>
            );
          })}

          <div className="mx-1 my-1.5 h-px bg-hairline" />

          <button
            type="button"
            onClick={() => setFiledByMeOnly(!filedByMeOnly)}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[14px] text-ink transition hover:bg-muted"
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition',
                filedByMeOnly ? 'border-brand-500 bg-brand-500 text-white' : 'border-field',
              )}
            >
              {filedByMeOnly ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </span>
            {t('disputes.filedByMeOnly')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ── Mobile card ─────────────────────────────────────────────────────────── */

function DisputeCard({ dispute }: { dispute: DisputeListItem }) {
  const { t } = useTranslation();

  return (
    <Link
      href={`/disputes/${dispute.id}`}
      className="shadow-card block rounded-2xl border border-hairline bg-surface p-4 transition hover:border-brand-border"
    >
      <div className="flex items-start justify-between gap-2">
        <StatusPill tone={STATUS_TONE[dispute.status]}>{t(`disputes.status.${dispute.status}`)}</StatusPill>
        <span className="text-[11.5px] font-semibold text-muted-foreground">
          #{dispute.id} · {dispute.filedAgo}
        </span>
      </div>

      <p className="mt-2 text-[15px] font-bold text-ink">{dispute.milestoneTitle}</p>
      <p className="text-[12px] text-muted-foreground">
        {dispute.dealName} · {dispute.counterparty}
      </p>

      {dispute.status === 'resolved' ? null : (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground">{t('disputes.disputedAmount')}</p>
            <p className="text-lg font-extrabold text-ink">{formatMoney(dispute.amount, dispute.currency)}</p>
          </div>
          {dispute.filedByYou ? (
            <span className="text-[12px] font-semibold text-muted-foreground">{t('disputes.filedByYou')}</span>
          ) : null}
        </div>
      )}

      {/* Banner */}
      {dispute.status === 'resolved' && dispute.outcome ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-positive-bg px-3 py-2.5 text-[12.5px] font-medium text-positive-text">
          <Check className="size-4 shrink-0" />
          {t('disputes.outcomePrefix')} {dispute.outcome}
        </div>
      ) : dispute.nextText && dispute.deadline ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-negative-bg-soft px-3 py-2.5 text-[12.5px] font-medium text-negative">
          <Clock className="size-4 shrink-0" />
          {t('disputes.detail.nextLine', { text: dispute.nextText, deadline: dispute.deadline })}
        </div>
      ) : null}
    </Link>
  );
}

/* ── Desktop table row ───────────────────────────────────────────────────── */

function DisputeRow({ dispute }: { dispute: DisputeListItem }) {
  const { t } = useTranslation();
  const meta = `#${dispute.id} · ${dispute.filedByYou ? `${t('disputes.filedByYou')} · ` : ''}${dispute.filedAgo}`;

  return (
    <div className={cn(GRID, 'border-b border-[#F1F5FA] px-5 py-4 transition hover:bg-muted/40')}>
      <Link href={`/disputes/${dispute.id}`} className="min-w-0">
        <p className="truncate text-[14px] font-bold text-ink hover:text-brand-700">{dispute.milestoneTitle}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">{meta}</p>
      </Link>
      <span className="truncate text-[13px] text-body">{dispute.dealName}</span>
      <span className="text-[13.5px] font-bold text-ink">{formatMoney(dispute.amount, dispute.currency, 0)}</span>
      <span>
        <StatusPill tone={STATUS_TONE[dispute.status]}>{t(`disputes.status.${dispute.status}`)}</StatusPill>
      </span>
      <div className="min-w-0">
        {dispute.status === 'resolved' && dispute.outcome ? (
          <p className="text-[12.5px] text-muted-foreground">
            {t('disputes.outcomePrefix')} {dispute.outcome}
          </p>
        ) : dispute.nextStepKey ? (
          <Link href={`/disputes/${dispute.id}`} className="text-[13px] font-semibold text-negative hover:underline">
            {t(dispute.nextStepKey)}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/* ── Loading & error states ──────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div className="shadow-card flex w-full items-center justify-center rounded-2xl border border-hairline bg-surface px-6 py-16">
      <span className="size-6 animate-spin rounded-full border-2 border-brand-100 border-t-brand-500" />
    </div>
  );
}

function ErrorState() {
  const { t } = useTranslation();
  return (
    <div className="shadow-card flex w-full flex-col items-center justify-center rounded-2xl border border-hairline bg-surface px-6 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-negative-bg-soft text-negative">
        <ShieldAlert className="size-7" />
      </span>
      <p className="mt-4 text-base font-bold text-ink">{t('common.error', { defaultValue: 'Something went wrong' })}</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
        {t('common.retry', { defaultValue: 'Please try again in a moment.' })}
      </p>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="shadow-card flex w-full flex-col items-center justify-center rounded-2xl border border-hairline bg-surface px-6 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        {hasFilters ? <ShieldAlert className="size-7" /> : <ShieldCheck className="size-7" />}
      </span>
      <p className="mt-4 text-base font-bold text-ink">
        {hasFilters ? t('disputes.resultsNone') : t('disputes.empty.title')}
      </p>
      {!hasFilters ? (
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{t('disputes.empty.body')}</p>
      ) : null}
    </div>
  );
}
