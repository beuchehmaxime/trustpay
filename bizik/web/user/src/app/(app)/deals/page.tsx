'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Clock, Loader2, MailOpen, Plus, Search, ShieldAlert, SlidersHorizontal, type LucideIcon } from 'lucide-react';

import { StatusPill } from '@/components/ui/status-pill';
import { AVATAR_TONE, DEAL_STATUS_TONE, PROGRESS_COLOR } from '@/components/deals/deal-meta';
import { normaliseError } from '@/lib/api/client';
import { type DealListItem, type DealStatus } from '@/lib/demo/deals';
import { useDeals } from '@/lib/hooks/use-deals';
import { useDeclineDeal } from '@/lib/hooks/use-contract';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

type TabKey = 'mine' | 'invited';
type FilterKey = 'all' | Extract<DealStatus, 'pending' | 'awaiting_funding' | 'in_progress' | 'disputed'>;
const FILTERS: FilterKey[] = ['all', 'pending', 'awaiting_funding', 'in_progress', 'disputed'];

/** Coloured "what's next" banner on the mobile deal card, by status. */
const CARD_BANNER: Partial<Record<DealStatus, { cls: string; icon: LucideIcon }>> = {
  in_progress: { cls: 'bg-positive-bg text-positive-text', icon: Check },
  awaiting_funding: { cls: 'bg-warning-bg-soft text-warning-text', icon: Clock },
  in_review: { cls: 'bg-cyan-bg text-cyan-text', icon: Clock },
  disputed: { cls: 'bg-negative-bg-soft text-negative', icon: ShieldAlert },
};
const GRID =
  'grid grid-cols-[minmax(220px,2.4fr)_minmax(140px,1.2fr)_minmax(130px,1.2fr)_minmax(120px,1fr)_minmax(150px,1.4fr)] items-center gap-3';

export default function DealsPage() {
  const { t } = useTranslation();
  const { deals, dealsSummary, isLoading } = useDeals();
  const [tab, setTab] = useState<TabKey>('mine');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const tabDeals = useMemo(
    () => deals.filter((deal) => deal.origin === (tab === 'invited' ? 'invited' : 'created')),
    [deals, tab],
  );

  // Invitations still awaiting an accept/decline (drives the banner + tab badge).
  const inviteCount = deals.filter((deal) => deal.isInvite).length;
  // Tab counts are "needs action", not totals:
  //  - My deals: deals you created that the counterparty hasn't accepted yet (still pending).
  //  - Invited: deals you were invited to and haven't accepted yet.
  const tabCount = {
    mine: deals.filter((deal) => deal.origin === 'created' && deal.status === 'pending').length,
    invited: inviteCount,
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tabDeals.filter((deal) => {
      if (filter !== 'all' && deal.status !== filter) return false;
      if (!query) return true;
      return `${deal.title} ${deal.partyName}`.toLowerCase().includes(query);
    });
  }, [tabDeals, filter, search]);

  const kpis = [
    { label: t('deals.kpi.active'), value: String(dealsSummary.active) },
    { label: t('deals.kpi.heldInEscrow'), value: formatMoney(dealsSummary.heldInEscrow, dealsSummary.currency, 0) },
    { label: t('deals.kpi.invited'), value: String(dealsSummary.invited) },
  ];

  const searchBox = (wrapperClass?: string) => (
    <div className={cn('relative', wrapperClass)}>
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('deals.searchPlaceholder')}
        className="h-10 w-full rounded-full border border-hairline bg-[#F8FBFF] pl-9 pr-3 text-[13px] text-ink outline-none transition placeholder:text-subtle focus:border-brand-border"
      />
    </div>
  );

  const tabsPill = (fullWidth = false) => (
    <div className={cn('rounded-full bg-muted p-1', fullWidth ? 'flex w-full' : 'inline-flex')}>
      {(['mine', 'invited'] as TabKey[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-4 py-3 text-[13px] font-semibold transition',
            fullWidth && 'flex-1 justify-center',
            tab === key ? 'bg-surface text-ink shadow-sm' : 'text-muted-foreground hover:text-ink',
          )}
        >
          {t(`deals.tab.${key}`)} · {tabCount[key]}
        </button>
      ))}
    </div>
  );

  const emptyState = (
    <div className="px-5 py-16 text-center">
      <p className="text-sm font-bold text-ink">
        {tab === 'mine' ? t('deals.emptyMineTitle') : t('deals.emptyInvited')}
      </p>
      {tab === 'mine' ? (
        <>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] text-muted-foreground">
            {t('deals.emptyMineSub')}
          </p>
          <Link
            href="/deals/new"
            className="bg-primary shadow-brand mt-4 inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold text-white transition hover:opacity-95"
          >
            <Plus className="size-4" />
            {t('deals.newDeal')}
          </Link>
        </>
      ) : null}
    </div>
  );

  const inviteBanner =
    inviteCount > 0 ? (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-border bg-brand-50/60 px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <MailOpen className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold text-ink">
            {t('deals.banner.invitesWaiting', { count: inviteCount })}
          </p>
          <p className="text-[12px] text-muted-foreground">{t('deals.banner.hint')}</p>
        </div>
        <button
          type="button"
          onClick={() => setTab('invited')}
          className="bg-primary shadow-brand shrink-0 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-95"
        >
          {t('deals.banner.review')}
        </button>
      </div>
    ) : null;

  if (isLoading && deals.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* ── Mobile: full-bleed white toolbar header, cards below ── */}
      <div className="md:hidden">
        <section className="-mx-4 -mt-4 bg-surface px-4 pb-4 pt-5 shadow-[0_10px_28px_-22px_rgba(11,31,58,0.35)]">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('nav.deals')}</h1>
            <Link
              href="/deals/new"
              className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-2 text-[13px] font-semibold text-brand-700 transition hover:bg-brand-100"
            >
              <Plus className="size-4" />
              {t('deals.newDeal')}
            </Link>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <FilterMenu filter={filter} setFilter={setFilter} count={tabDeals.length} />
            {searchBox('flex-1')}
          </div>
          <div className="mt-3">{tabsPill(true)}</div>
        </section>

        {/* Content below the header */}
        <div className="space-y-4 pt-4">
          {inviteBanner}
          {filtered.length === 0 ? (
            emptyState
          ) : (
            <div className="space-y-3">
              {filtered.map((deal) => (
                <DealCard key={deal.id} deal={deal} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop: banner + KPIs + table card ── */}
      <div className="hidden space-y-5 md:block">
        {inviteBanner}
        <div className="grid gap-4 md:grid-cols-3">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
              <p className="text-[12.5px] font-semibold text-muted-foreground">{kpi.label}</p>
              <p className="mt-1.5 text-2xl font-extrabold tracking-[-0.5px] text-ink">{kpi.value}</p>
            </div>
          ))}
        </div>

        <section className="shadow-card w-full overflow-hidden rounded-2xl border border-hairline bg-surface">
          <div className="flex items-center gap-3 border-b border-hairline p-4">
            {tabsPill()}
            <div className="ml-auto flex items-center gap-2">
              <FilterMenu filter={filter} setFilter={setFilter} count={tabDeals.length} />
              {searchBox('w-64')}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className={cn(GRID, 'border-b border-hairline px-5 py-3')}>
                {(['deal', 'escrowValue', 'progress', 'status', 'nextStep'] as const).map((col) => (
                  <span key={col} className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                    {t(`deals.col.${col}`)}
                  </span>
                ))}
              </div>
              {filtered.length === 0 ? (
                emptyState
              ) : (
                filtered.map((deal) => <DealRow key={deal.id} deal={deal} />)
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ── Left filter control ─────────────────────────────────────────────────── */

function FilterMenu({
  filter,
  setFilter,
  count,
}: {
  filter: FilterKey;
  setFilter: (value: FilterKey) => void;
  count: number;
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

  const active = filter !== 'all';

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('deals.filterLabel')}
        className={cn(
          'relative flex size-10 items-center justify-center rounded-full border transition',
          active || open
            ? 'border-brand-500 bg-brand-50 text-brand-700'
            : 'border-hairline bg-surface text-muted-foreground hover:border-brand-border hover:text-ink',
        )}
      >
        <SlidersHorizontal className="size-[18px]" />
        {active ? (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-brand-500 ring-2 ring-surface" />
        ) : null}
      </button>

      {open ? (
        <div className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 absolute left-0 top-[calc(100%+8px)] z-30 w-60 rounded-2xl border border-hairline bg-surface p-2 shadow-[0_20px_44px_-16px_rgba(11,31,58,0.28)] duration-150">
          <p className="px-2.5 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-subtle">
            {t('deals.filterStatus')}
          </p>
          {FILTERS.map((key) => {
            const selected = filter === key;
            const label = t(`deals.filter.${key}`);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-[14px] transition',
                  selected ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink hover:bg-muted',
                )}
              >
                {key === 'all' ? `${label} · ${count}` : label}
                {selected ? <Check className="size-4" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function DealRow({ deal }: { deal: DealListItem }) {
  const { t } = useTranslation();
  const decline = useDeclineDeal();
  const onDecline = () => {
    if (!window.confirm(t('deals.declineConfirm'))) return;
    decline.mutate(deal.id, {
      onError: (error) => toast.error(normaliseError(error).message),
      onSuccess: () => toast.success(t('deals.declineSuccess')),
    });
  };
  const meta = deal.partyMetaKey ? t(deal.partyMetaKey) : deal.partyMeta;
  const subtitle =
    deal.relKey === 'invitedBy'
      ? `${t('deals.rel.invitedBy')} ${deal.partyName}`
      : `${t(`deals.rel.${deal.relKey}`)} ${deal.partyName}${meta ? ` · ${meta}` : ''}`;
  const pct = deal.total > 0 ? Math.max(deal.done === 0 ? 6 : 0, (deal.done / deal.total) * 100) : 0;

  return (
    <div className={cn(GRID, 'border-b border-[#F1F5FA] px-5 py-4 transition hover:bg-muted/40')}>
      {/* Deal */}
      <Link href={`/deals/${deal.id}`} className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full text-[12px] font-bold',
            AVATAR_TONE[deal.avatarTone],
          )}
        >
          {deal.initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold text-ink hover:text-brand-700">{deal.title}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{subtitle}</p>
        </div>
      </Link>

      {/* Escrow value */}
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold text-ink">{formatMoney(deal.escrowValue, deal.escrowCurrency, 0)}</p>
        {deal.approx ? <p className="text-[11px] text-muted-foreground">{deal.approx}</p> : null}
      </div>

      {/* Progress */}
      <div className="min-w-0">
        {deal.total > 0 ? (
          <>
            <p className="mb-1.5 text-[11.5px] font-semibold text-muted-foreground">
              {deal.done}/{deal.total}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEF2F7]">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: PROGRESS_COLOR[deal.progressTone] }}
              />
            </div>
          </>
        ) : (
          <span className="text-[13px] text-subtle">-</span>
        )}
      </div>

      {/* Status */}
      <span>
        <StatusPill tone={DEAL_STATUS_TONE[deal.status]}>{t(`deals.status.${deal.status}`)}</StatusPill>
      </span>

      {/* Next step */}
      <div>
        {deal.isInvite ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/deals/${deal.id}`}
              className="bg-primary shadow-brand inline-flex rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-95"
            >
              {t('deals.accept')}
            </Link>
            <button
              type="button"
              disabled={decline.isPending}
              onClick={onDecline}
              className="inline-flex rounded-lg border border-negative-bg px-3.5 py-1.5 text-[12.5px] font-semibold text-negative transition hover:bg-negative-bg-soft disabled:opacity-60"
            >
              {t('deals.decline')}
            </button>
          </div>
        ) : deal.nextStepKey ? (
          <Link
            href={`/deals/${deal.id}`}
            className={cn(
              'text-[13px] font-semibold',
              deal.nextStepMuted ? 'text-muted-foreground' : 'text-[#16a34a] hover:underline',
            )}
          >
            {t(deal.nextStepKey, deal.nextStepParams)}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Mobile deal card (matches the PWA home design): avatar + title, amount,
 *  progress bar and a colour-coded "what's next" banner. */
function DealCard({ deal }: { deal: DealListItem }) {
  const { t } = useTranslation();
  const decline = useDeclineDeal();
  const onDecline = () => {
    if (!window.confirm(t('deals.declineConfirm'))) return;
    decline.mutate(deal.id, {
      onError: (error) => toast.error(normaliseError(error).message),
      onSuccess: () => toast.success(t('deals.declineSuccess')),
    });
  };
  const meta = deal.partyMetaKey ? t(deal.partyMetaKey) : deal.partyMeta;
  const subtitle =
    deal.relKey === 'invitedBy'
      ? `${t('deals.rel.invitedBy')} ${deal.partyName}`
      : `${t(`deals.rel.${deal.relKey}`)} ${deal.partyName}${meta ? ` · ${meta}` : ''}`;
  const pct = deal.total > 0 ? Math.max(deal.done === 0 ? 4 : 0, (deal.done / deal.total) * 100) : 0;
  const banner = CARD_BANNER[deal.status];

  const body = (
    <>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold',
            AVATAR_TONE[deal.avatarTone],
          )}
        >
          {deal.initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-ink">{deal.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</p>
        </div>
        <StatusPill tone={DEAL_STATUS_TONE[deal.status]} className="shrink-0">
          {t(`deals.status.${deal.status}`)}
        </StatusPill>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-extrabold tracking-[-0.4px] text-ink">
            {formatMoney(deal.escrowValue, deal.escrowCurrency, 2)}
          </p>
          {deal.approx ? (
            <p className="truncate text-[11.5px] text-muted-foreground">
              {deal.payeeName ? t('deals.forName', { amount: deal.approx, name: deal.payeeName }) : deal.approx}
            </p>
          ) : null}
        </div>
        <p className="shrink-0 text-[12px] font-medium text-muted-foreground">
          {deal.due && deal.status === 'awaiting_funding'
            ? t('deals.due', { date: deal.due })
            : deal.total > 0
              ? t('deals.milestones', { done: deal.done, total: deal.total })
              : ''}
        </p>
      </div>

      {deal.total > 0 ? (
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#EEF2F7]">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: PROGRESS_COLOR[deal.progressTone] }}
          />
        </div>
      ) : null}
    </>
  );

  if (deal.isInvite) {
    return (
      <div className="shadow-card rounded-2xl border border-hairline bg-surface p-4">
        {body}
        <div className="mt-3 flex gap-2">
          <Link
            href={`/deals/${deal.id}`}
            className="bg-primary shadow-brand block flex-1 rounded-lg py-2.5 text-center text-[13px] font-semibold text-white transition hover:opacity-95"
          >
            {t('deals.accept')}
          </Link>
          <button
            type="button"
            disabled={decline.isPending}
            onClick={onDecline}
            className="flex-1 rounded-lg border border-negative-bg py-2.5 text-center text-[13px] font-semibold text-negative transition hover:bg-negative-bg-soft disabled:opacity-60"
          >
            {t('deals.decline')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/deals/${deal.id}`}
      className="shadow-card block rounded-2xl border border-hairline bg-surface p-4 transition hover:border-brand-border"
    >
      {body}
      {banner ? (
        <div className={cn('mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-medium', banner.cls)}>
          <banner.icon className="size-4 shrink-0" />
          {t(`deals.cardBanner.${deal.status}`)}
        </div>
      ) : null}
    </Link>
  );
}
