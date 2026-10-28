'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ExternalLink, Landmark, Loader2, Lock, Search, X } from 'lucide-react';

import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { humanizeMethod } from '@/lib/method-format';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useEscrowAccounts,
  useEscrowLedger,
  useEscrowStats,
  useEscrowTransaction,
} from '@/features/escrow/hooks';
import {
  AccountStatusBadge,
  TxStatusText,
  TxTypeBadge,
  money,
  signedMoney,
} from '@/features/escrow/escrow-ui';
import type {
  EscrowAccountStatusValue,
  EscrowTxTypeValue,
  TxStatusValue,
} from '@/features/escrow/types';

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CURRENCIES = ['', 'USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF'];

const ACCOUNT_STATUSES: { value: EscrowAccountStatusValue | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PARTIALLY_RELEASED', label: 'Partially released' },
  { value: 'RELEASED', label: 'Released' },
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'FROZEN', label: 'Frozen' },
];

const TX_TYPES: { value: EscrowTxTypeValue | ''; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'FUND', label: 'Fund' },
  { value: 'HOLD', label: 'Hold' },
  { value: 'RELEASE', label: 'Release' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
];

const TX_STATUSES: { value: TxStatusValue | ''; label: string }[] = [
  { value: '', label: 'All states' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REVERSED', label: 'Reversed' },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function EscrowPage() {
  const canView = usePermission('escrow.view');
  const [tab, setTab] = useState<'accounts' | 'ledger'>('accounts');
  const { data: stats } = useEscrowStats();

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You don’t have permission to view escrow &amp; transactions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase">
          <span className="text-muted-foreground">Commerce</span>{' '}
          <span className="text-ink">Escrow &amp; transactions</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Escrow &amp; transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor escrow balances and the transaction ledger; manual release, refund, adjustment
          and reconciliation.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Escrow accounts" value={stats?.totalAccounts} />
        <StatCard label="Open" value={stats?.open} note="holding funds" tone="brand" />
        <StatCard label="Frozen" value={stats?.frozen} note="disputes/AML" tone="negative" />
        <StatCard label="Refunded" value={stats?.refunded} note="returned" tone="muted" />
      </div>

      {/* Balances by currency */}
      {stats && stats.byCurrency.length > 0 ? (
        <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="mb-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Balances by currency
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {stats.byCurrency.map((row) => (
              <div key={row.currency} className="rounded-lg border border-hairline px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">{row.currency}</span>
                  <span className="text-[10px] text-muted-foreground">{row.accounts}</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-bold text-ink tabular-nums">
                  {money(row.held, row.currency)}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {money(row.released, row.currency)} released
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-hairline bg-surface p-1 w-fit">
        <TabButton active={tab === 'accounts'} onClick={() => setTab('accounts')}>
          Accounts
        </TabButton>
        <TabButton active={tab === 'ledger'} onClick={() => setTab('ledger')}>
          Transaction ledger
        </TabButton>
      </div>

      {tab === 'accounts' ? <AccountsTab /> : <LedgerTab active={tab === 'ledger'} />}
    </div>
  );
}

function AccountsTab() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EscrowAccountStatusValue | ''>('');
  const [currency, setCurrency] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isError, error } = useEscrowAccounts({
    search: search || undefined,
    status: status || undefined,
    currency: currency || undefined,
    page,
    pageSize,
  });
  const accounts = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
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
            placeholder="Search by contract ID or sub-account ref…"
            className="h-10 w-full rounded-lg border border-field bg-white pr-3 pl-10 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
          />
        </div>
        <FilterSelect
          value={status}
          onChange={(value) => {
            setStatus(value as EscrowAccountStatusValue | '');
            setPage(1);
          }}
        >
          {ACCOUNT_STATUSES.map((option) => (
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
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code === '' ? 'All currencies' : code}
            </option>
          ))}
        </FilterSelect>
      </div>

      {isError ? (
        <div className="p-6 text-sm text-destructive">{normaliseError(error).message}</div>
      ) : isLoading ? (
        <Loading />
      ) : accounts.length === 0 ? (
        <EmptyState label="No escrow accounts match your filters." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <HeaderCell>Deal</HeaderCell>
                <HeaderCell>Currency</HeaderCell>
                <HeaderCell>Held</HeaderCell>
                <HeaderCell>Released</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Txns</HeaderCell>
                <HeaderCell className="text-right">View</HeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id} className="hover:bg-muted/40">
                  <TableCell className="py-4">
                    <div className="font-semibold text-ink">{account.contractTitle}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {account.contractId}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-ink">{account.currency}</TableCell>
                  <TableCell className="font-semibold text-ink">
                    {money(account.held, account.currency)}
                  </TableCell>
                  <TableCell className="text-positive">
                    {money(account.released, account.currency)}
                  </TableCell>
                  <TableCell>
                    <AccountStatusBadge status={account.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{account.transactionCount}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/escrow/${account.id}`}
                      className="inline-flex items-center gap-1 font-medium text-brand-600 hover:opacity-80"
                    >
                      View <ArrowRight className="size-3.5" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} unit="account" />
        </>
      )}
    </div>
  );
}

function LedgerTab({ active }: { active: boolean }) {
  const [type, setType] = useState<EscrowTxTypeValue | ''>('');
  const [status, setStatus] = useState<TxStatusValue | ''>('');
  const [currency, setCurrency] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const pageSize = 25;

  const { data, isLoading, isError, error } = useEscrowLedger(
    {
      type: type || undefined,
      status: status || undefined,
      currency: currency || undefined,
      page,
      pageSize,
    },
    active,
  );
  const transactions = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-col gap-2.5 border-b border-hairline px-6 py-4 lg:flex-row lg:items-center">
        <span className="flex-1 text-sm text-muted-foreground">Every escrow movement, newest first.</span>
        <FilterSelect
          value={type}
          onChange={(value) => {
            setType(value as EscrowTxTypeValue | '');
            setPage(1);
          }}
        >
          {TX_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={status}
          onChange={(value) => {
            setStatus(value as TxStatusValue | '');
            setPage(1);
          }}
        >
          {TX_STATUSES.map((option) => (
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
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code === '' ? 'All currencies' : code}
            </option>
          ))}
        </FilterSelect>
      </div>

      {isError ? (
        <div className="p-6 text-sm text-destructive">{normaliseError(error).message}</div>
      ) : isLoading ? (
        <Loading />
      ) : transactions.length === 0 ? (
        <EmptyState label="No transactions match your filters." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <HeaderCell>Type</HeaderCell>
                <HeaderCell>Amount</HeaderCell>
                <HeaderCell>Contract</HeaderCell>
                <HeaderCell>State</HeaderCell>
                <HeaderCell>Gateway</HeaderCell>
                <HeaderCell>Date</HeaderCell>
                <HeaderCell className="text-right">View</HeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => {
                const signed = transaction.type === 'REFUND' ? -transaction.amount : transaction.amount;
                return (
                  <TableRow
                    key={transaction.id}
                    onClick={() => setSelectedTxId(transaction.id)}
                    className="cursor-pointer hover:bg-muted/40"
                  >
                    <TableCell className="py-3.5">
                      <TxTypeBadge type={transaction.type} />
                      {transaction.note ? (
                        <div className="mt-1 max-w-55 truncate text-xs text-muted-foreground">
                          {transaction.note}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'font-semibold',
                        transaction.type === 'RELEASE'
                          ? 'text-positive'
                          : transaction.type === 'REFUND'
                            ? 'text-amber-600'
                            : 'text-ink',
                      )}
                    >
                      {signedMoney(signed, transaction.currency)}
                    </TableCell>
                    <TableCell>
                      {transaction.contractId ? (
                        <Link
                          href={`/contracts/${transaction.contractId}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-mono text-xs text-brand-600 hover:opacity-80"
                        >
                          {transaction.contractId}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <TxStatusText status={transaction.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {transaction.gateway ? humanizeMethod(transaction.gateway) : '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(transaction.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 font-medium text-brand-600">
                        Details <ArrowRight className="size-3.5" />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            onChange={setPage}
            unit="transaction"
          />
        </>
      )}

      <TransactionDetailDrawer id={selectedTxId} onClose={() => setSelectedTxId(null)} />
    </div>
  );
}

/** Slide-over showing the full detail of a single ledger transaction. */
function TransactionDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: tx, isLoading, isError, error } = useEscrowTransaction(id);
  if (!id) return null;

  const signed = tx && tx.type === 'REFUND' ? -tx.amount : (tx?.amount ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]"
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-hairline bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Transaction
            </p>
            <p className="font-mono text-sm font-semibold text-ink">{tx?.reference ?? '…'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {isError ? (
          <div className="p-6 text-sm text-destructive">{normaliseError(error).message}</div>
        ) : isLoading || !tx ? (
          <Loading />
        ) : (
          <div className="flex-1 space-y-6 px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TxTypeBadge type={tx.type} />
                <TxStatusText status={tx.status} />
              </div>
              <span
                className={cn(
                  'text-lg font-bold tabular-nums',
                  tx.type === 'RELEASE'
                    ? 'text-positive'
                    : tx.type === 'REFUND'
                      ? 'text-amber-600'
                      : 'text-ink',
                )}
              >
                {signedMoney(signed, tx.currency)}
              </span>
            </div>

            {tx.note ? (
              <p className="rounded-lg border border-hairline bg-muted/40 px-3 py-2 text-sm text-ink">
                {tx.note}
              </p>
            ) : null}

            <DetailSection title="Transaction">
              <DetailRow label="Reference" value={tx.reference} mono />
              <DetailRow label="Type" value={tx.type} />
              <DetailRow label="Amount" value={money(tx.amount, tx.currency)} />
              <DetailRow label="Currency" value={tx.currency} />
              <DetailRow label="Created" value={formatDateTime(tx.createdAt)} />
              <DetailRow label="Completed" value={formatDateTime(tx.completedAt)} />
            </DetailSection>

            <DetailSection title="Gateway">
              <DetailRow label="Provider" value={tx.gateway ? humanizeMethod(tx.gateway) : '-'} />
              <DetailRow label="Gateway ref" value={tx.gatewayRef ?? '-'} mono />
            </DetailSection>

            {tx.milestone ? (
              <DetailSection title="Milestone">
                <DetailRow label="Title" value={`M${tx.milestone.order} · ${tx.milestone.title}`} />
                <DetailRow
                  label="Amount"
                  value={money(tx.milestone.amount, tx.milestone.currency)}
                />
                <DetailRow label="Status" value={tx.milestone.status} />
              </DetailSection>
            ) : null}

            {tx.account ? (
              <DetailSection title="Escrow account">
                <DetailRow label="Sub-account" value={tx.account.subAccountRef} mono />
                <DetailRow label="Status" value={tx.account.status} />
                <DetailRow label="Held" value={money(tx.account.held, tx.account.currency)} />
                <DetailRow label="Released" value={money(tx.account.released, tx.account.currency)} />
              </DetailSection>
            ) : null}

            <DetailSection title="Deal">
              <DetailRow label="Payer" value={tx.payerName ?? '-'} />
              <DetailRow label="Payee" value={tx.payeeName ?? '-'} />
              {tx.contract ? (
                <>
                  <DetailRow label="Title" value={tx.contract.title} />
                  <DetailRow label="Status" value={tx.contract.status} />
                </>
              ) : null}
            </DetailSection>

            {tx.contractId ? (
              <Link
                href={`/contracts/${tx.contractId}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
              >
                Open deal {tx.contractId} <ExternalLink className="size-3.5" />
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </p>
      <dl className="divide-y divide-hairline rounded-lg border border-hairline">{children}</dl>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-right text-sm font-medium text-ink', mono && 'font-mono text-xs')}>
        {value}
      </dd>
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
        'rounded-lg px-4 py-2 text-sm font-medium transition',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-ink',
      )}
    >
      {children}
    </button>
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

function Loading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <Landmark className="size-8 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  onChange,
  unit,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  unit: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasNext = page * pageSize < total;
  return (
    <div className="flex items-center justify-between border-t border-hairline px-6 py-3 text-sm text-muted-foreground">
      <span>
        {total} {unit}
        {total === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-xs">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onChange(Math.max(1, page - 1))}
            className="rounded-lg border border-field px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-muted disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => onChange(page + 1)}
            className="rounded-lg border border-field px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-muted disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
