'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';

import { StatusPill } from '@/components/ui/status-pill';
import { TransactionDrawer } from '@/components/wallet/transaction-drawer';
import { TX_KIND_META, TX_STATUS_TONE, TX_TILE, txAmount } from '@/components/wallet/tx-meta';
import type { WalletTransaction } from '@/lib/api/wallet.api';
import { useWallet, useWalletTransactions } from '@/lib/hooks/use-wallet';
import type { Transaction, TxCategory, TxDirection, TxKind } from '@/lib/demo/transactions';
import { formatMoney, humanizeMethod } from '@/lib/format';
import { cn } from '@/lib/utils';

type FilterKey = 'all' | TxCategory;
const FILTERS: FilterKey[] = ['all', 'escrow', 'topup', 'payout', 'fx'];
const PAGE_SIZE = 6;
const GRID =
  'grid grid-cols-[minmax(200px,2.3fr)_minmax(110px,1.2fr)_minmax(130px,1.35fr)_minmax(120px,1fr)_minmax(96px,0.85fr)_88px] items-center gap-3';

/** Backend reference type → the drawer/table `TxKind` (drives icon, tone, title). */
const KIND_BY_TYPE: Record<string, TxKind> = {
  milestone: 'escrowReleased',
  release: 'escrowReleased',
  escrow_fund: 'escrowFunded',
  topup: 'walletTopup',
  deposit: 'walletTopup',
  refund: 'walletTopup',
  payout: 'withdraw',
  withdrawal: 'withdraw',
  fee: 'withdraw',
  fx: 'currencyConversion',
};
const CATEGORY_BY_KIND: Record<TxKind, TxCategory> = {
  escrowReleased: 'escrow',
  escrowFunded: 'escrow',
  escrowHeldDispute: 'escrow',
  walletTopup: 'topup',
  withdraw: 'payout',
  currencyConversion: 'fx',
};

/**
 * Adapt a live backend `WalletTransaction` (signed amount, ISO date, date-group
 * label) onto the richer `Transaction` shape the table, mobile list and detail
 * drawer already render. Fields with no backend source (fee, deal, status,
 * intraday time) fall back to sensible defaults.
 */
function toTransaction(entry: WalletTransaction): Transaction {
  const kind = KIND_BY_TYPE[entry.type] ?? (entry.amount < 0 ? 'withdraw' : 'walletTopup');
  const direction: TxDirection = entry.amount > 0 ? 'in' : entry.amount < 0 ? 'out' : 'neutral';
  return {
    id: entry.id,
    ref: entry.reference ?? entry.id,
    kind,
    category: CATEGORY_BY_KIND[kind],
    direction,
    amount: Math.abs(entry.amount),
    currency: entry.currency,
    fee: 0,
    method: humanizeMethod(entry.subtitle || entry.title),
    status: (entry.status as Transaction['status']) ?? 'completed',
    dateLabel: entry.group,
    today: entry.group.toLowerCase() === 'today',
    time: entry.date,
    detail: { about: entry.subtitle || entry.title },
  };
}

export default function TransactionsPage() {
  const { t } = useTranslation();
  const { homeCurrency } = useWallet();
  const { data, isLoading, isError } = useWalletTransactions();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Transaction | null>(null);

  const transactions = useMemo(() => (data ?? []).map(toTransaction), [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((transaction) => {
      if (filter !== 'all' && transaction.category !== filter) return false;
      if (!query) return true;
      const haystack = [
        transaction.ref,
        transaction.method,
        t(`tx.kind.${transaction.kind}`, transaction.titleParams),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [transactions, filter, search, t]);

  useEffect(() => setPage(1), [filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const groups: { label: string; today: boolean; items: Transaction[] }[] = [];
  for (const item of pageItems) {
    const last = groups[groups.length - 1];
    if (!last || last.label !== item.dateLabel) {
      groups.push({ label: item.dateLabel, today: Boolean(item.today), items: [item] });
    } else {
      last.items.push(item);
    }
  }

  const from = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, filtered.length);

  // Period KPIs, computed from the live ledger (single home currency; fees have
  // no per-transaction backend source so that tile is omitted).
  const moneyIn = transactions
    .filter((item) => item.direction === 'in' && item.currency === homeCurrency)
    .reduce((sum, item) => sum + item.amount, 0);
  const moneyOut = transactions
    .filter((item) => item.direction === 'out' && item.currency === homeCurrency)
    .reduce((sum, item) => sum + item.amount, 0);
  const periodLabel = transactions.length
    ? `${transactions[0].dateLabel} - ${transactions[transactions.length - 1].dateLabel}`
    : t('tx.today');

  const kpis = [
    { label: t('tx.kpi.moneyIn'), value: `+ ${formatMoney(moneyIn, homeCurrency, 0)}`, className: 'text-[#16a34a]' },
    { label: t('tx.kpi.moneyOut'), value: `− ${formatMoney(moneyOut, homeCurrency, 0)}`, className: 'text-[#f43f5e]' },
    { label: t('tx.kpi.count'), value: String(transactions.length), className: 'text-ink' },
  ];

  const exportCsv = () => {
    const header = ['Reference', 'Date', 'Description', 'Method', 'Amount', 'Currency', 'Status'];
    const cell = (value: string | number) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = filtered.map((transaction) =>
      [
        transaction.ref,
        transaction.dateLabel,
        t(`tx.kind.${transaction.kind}`, transaction.titleParams),
        transaction.method,
        transaction.amount,
        transaction.currency,
        transaction.status,
      ]
        .map(cell)
        .join(','),
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bizik-transactions.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // Mobile view groups the full ledger by date (no pagination / table chrome).
  const mobileGroups: { label: string; today: boolean; items: Transaction[] }[] = [];
  for (const item of filtered) {
    const last = mobileGroups[mobileGroups.length - 1];
    if (!last || last.label !== item.dateLabel) {
      mobileGroups.push({ label: item.dateLabel, today: Boolean(item.today), items: [item] });
    } else {
      last.items.push(item);
    }
  }

  return (
    <div className="w-full">
      {/* ── Mobile: full-width header + date-grouped list (matches the app design) ── */}
      <div className="md:hidden">
        <div className="-mx-4 -mt-4 border-b border-hairline bg-surface px-4 pb-4 pt-5">
          <h1 className="text-xl font-extrabold text-ink">{t('nav.transactions')}</h1>
        </div>

        <div className="mt-4 space-y-5">
          {mobileGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-subtle">
                {group.today ? t('tx.today') : group.label}
              </p>
              <div className="shadow-card divide-y divide-[#F1F5FA] overflow-hidden rounded-2xl border border-hairline bg-surface">
                {group.items.map((transaction) => {
                  const meta = TX_KIND_META[transaction.kind];
                  const amount = txAmount(transaction);
                  return (
                    <button
                      key={transaction.id}
                      type="button"
                      onClick={() => setSelected(transaction)}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-muted/40"
                    >
                      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TX_TILE[meta.tone])}>
                        <meta.icon className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold text-ink">
                          {t(`tx.kind.${transaction.kind}`, transaction.titleParams)}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {transaction.dealLabel ?? transaction.method}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={cn('block text-[13.5px] font-bold', amount.className)}>{amount.text}</span>
                        <span className="block text-[11px] text-muted-foreground">{transaction.time}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-subtle" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Loading placeholder */}
          {isLoading ? (
            <div>
              <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-subtle">{t('tx.loading')}</p>
              <div className="shadow-card space-y-3 rounded-2xl border border-hairline bg-surface p-4">
                {[0, 1].map((row) => (
                  <div key={row} className="flex items-center gap-3">
                    <span className="size-10 shrink-0 animate-pulse rounded-xl bg-muted" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3 w-1/2 animate-pulse rounded bg-muted" />
                      <span className="block h-2.5 w-2/3 animate-pulse rounded bg-muted" />
                    </span>
                    <span className="h-3 w-14 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Error / empty */}
          {!isLoading && isError ? (
            <div className="shadow-card rounded-2xl border border-hairline bg-surface px-5 py-12 text-center">
              <p className="text-sm font-bold text-ink">{t('tx.errorTitle')}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{t('tx.errorHint')}</p>
            </div>
          ) : null}
          {!isLoading && !isError && mobileGroups.length === 0 ? (
            <div className="shadow-card rounded-2xl border border-hairline bg-surface px-5 py-12 text-center">
              <p className="text-sm font-bold text-ink">{t('tx.empty')}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{t('tx.emptyHint')}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Desktop: KPI row + full table ── */}
      <div className="hidden space-y-5 md:block">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
            <p className="text-[12.5px] font-semibold text-muted-foreground">{kpi.label}</p>
            <p className={cn('mt-1.5 text-xl font-extrabold tracking-[-0.4px]', kpi.className)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <section className="shadow-card w-full overflow-hidden rounded-2xl border border-hairline bg-surface">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-hairline p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1 lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('tx.searchPlaceholder')}
              className="h-10 w-full rounded-full border border-hairline bg-[#F8FBFF] pl-9 pr-3 text-[13px] text-ink outline-none transition placeholder:text-subtle focus:border-brand-border"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((key) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition',
                    active
                      ? 'bg-brand-500 text-white shadow-brand'
                      : 'border border-hairline bg-surface text-muted-foreground hover:border-brand-border hover:text-ink',
                  )}
                >
                  {t(`tx.filter.${key}`)}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 lg:ml-auto">
            <span className="flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-ink">
              <Calendar className="size-4 text-muted-foreground" />
              {periodLabel}
            </span>
            <button
              type="button"
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-full border border-hairline bg-surface px-3.5 py-2 text-[13px] font-semibold text-brand-700 transition hover:border-brand-border hover:bg-brand-50"
            >
              <Download className="size-4" />
              {t('tx.exportCsv')}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            {/* Column header */}
            <div className={cn(GRID, 'border-b border-hairline px-5 py-3')}>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                {t('tx.col.description')}
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                {t('tx.col.deal')}
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                {t('tx.col.method')}
              </span>
              <span className="text-right text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                {t('tx.col.amount')}
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                {t('tx.col.status')}
              </span>
              <span />
            </div>

            {isLoading ? (
              <div className="px-5 py-16 text-center">
                <p className="text-sm font-bold text-ink">{t('tx.loading')}</p>
              </div>
            ) : isError ? (
              <div className="px-5 py-16 text-center">
                <p className="text-sm font-bold text-ink">{t('tx.errorTitle')}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">{t('tx.errorHint')}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <p className="text-sm font-bold text-ink">{t('tx.empty')}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">{t('tx.emptyHint')}</p>
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <div className="bg-[#F8FAFD] px-5 py-2.5">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                      {group.today ? `${t('tx.today')} · ${group.label}` : group.label}
                    </p>
                  </div>
                  {group.items.map((transaction) => {
                    const meta = TX_KIND_META[transaction.kind];
                    const amount = txAmount(transaction);
                    return (
                      <div
                        key={transaction.id}
                        className={cn(GRID, 'border-b border-[#F1F5FA] px-5 py-3.5 transition hover:bg-muted/40')}
                      >
                        {/* Description */}
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-full',
                              TX_TILE[meta.tone],
                            )}
                          >
                            <meta.icon className="size-[17px]" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-bold text-ink">
                              {t(`tx.kind.${transaction.kind}`, transaction.titleParams)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {transaction.time} · {transaction.ref}
                            </p>
                          </div>
                        </div>
                        {/* Deal */}
                        <span className="truncate text-[12.5px] text-body">
                          {transaction.dealLabel ?? '-'}
                        </span>
                        {/* Method */}
                        <span className="truncate text-[12.5px] text-body">{transaction.method}</span>
                        {/* Amount */}
                        <span className={cn('text-right text-[13.5px] font-bold', amount.className)}>
                          {amount.text}
                        </span>
                        {/* Status */}
                        <span>
                          <StatusPill tone={TX_STATUS_TONE[transaction.status]}>
                            {t(`tx.status.${transaction.status}`)}
                          </StatusPill>
                        </span>
                        {/* View */}
                        <span className="text-right">
                          <button
                            type="button"
                            onClick={() => setSelected(transaction)}
                            className="inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-brand-700 transition hover:text-brand-600"
                          >
                            {t('tx.view')}
                            <ChevronRight className="size-3.5" />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <p className="text-[12.5px] text-muted-foreground">
            {t('tx.showing', { from, to, total: filtered.length })}
          </p>
          {totalPages > 1 ? (
            <div className="flex items-center gap-1">
              <PagerButton
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </PagerButton>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-lg text-[13px] font-semibold transition',
                    pageNumber === currentPage
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-muted-foreground hover:bg-muted hover:text-ink',
                  )}
                >
                  {pageNumber}
                </button>
              ))}
              <PagerButton
                disabled={currentPage === totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </PagerButton>
            </div>
          ) : null}
        </div>
      </section>
      </div>

      <TransactionDrawer transaction={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function PagerButton({
  children,
  disabled,
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-lg border border-hairline text-muted-foreground transition enabled:hover:bg-muted enabled:hover:text-ink disabled:opacity-40"
      {...rest}
    >
      {children}
    </button>
  );
}
