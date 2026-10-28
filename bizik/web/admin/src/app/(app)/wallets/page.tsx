'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  PauseCircle,
  RotateCw,
  Search,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';

import { ConfirmDialog } from '@/components/confirm-dialog';
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
import {
  usePayoutActions,
  usePayoutRail,
  usePayoutStats,
  usePayouts,
  useWalletStats,
  useWalletTransaction,
  useWalletTransactions,
  useWallets,
  useWithdrawalHoldActions,
  useWithdrawalHolds,
} from '@/features/wallets/hooks';
import {
  PayoutStatusBadge,
  WalletStatusBadge,
  WalletTxTypeBadge,
  methodLabel,
  money,
  signedMoney,
} from '@/features/wallets/wallets-ui';
import type {
  PayoutRequest,
  PayoutStatusValue,
  WalletStatusValue,
  WalletTxTypeValue,
} from '@/features/wallets/types';

const CURRENCIES = ['', 'USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF'];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

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

/** Human "waiting since" label, e.g. "3h ago", "2d ago", falling back to a date. */
function waitingSince(value: string): string {
  const then = new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays <= 7) return `${diffDays}d ago`;
  return formatDate(value);
}

interface PendingAction {
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  run: (value: string) => Promise<unknown>;
  tone?: 'default' | 'danger' | 'warning';
  subject?: { label: string; value: string };
  consequences?: string[];
  input?: { label?: string; placeholder?: string; required?: boolean; minLength?: number };
}

export default function WalletsPage() {
  const canViewWallets = usePermission('wallets.view');
  const canViewPayouts = usePermission('payouts.view');
  const [tab, setTab] = useState<'wallets' | 'transactions' | 'payouts' | 'approvals'>(
    canViewWallets ? 'wallets' : 'payouts',
  );
  const { data: walletStats } = useWalletStats();
  const { data: payoutStats } = usePayoutStats();

  if (!canViewWallets && !canViewPayouts) {
    return <NoAccess message="You don’t have permission to view wallets or payouts." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase">
          <span className="text-muted-foreground">Commerce</span>{' '}
          <span className="text-ink">Wallets &amp; payouts</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Wallets &amp; payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View user wallets, every deposit and withdrawal, and payout methods; approve, hold or
          retry payouts in the queue.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Wallets"
          value={walletStats?.totalWallets}
          note={
            walletStats ? `held by ${walletStats.totalHolders.toLocaleString('en-US')} people` : undefined
          }
        />
        <StatCard label="Pending payouts" value={payoutStats?.pending} note="awaiting" tone="brand" />
        <StatCard label="On hold" value={payoutStats?.onHold} note="review" tone="warning" />
        <StatCard label="Failed" value={payoutStats?.failed} note="need attention" tone="negative" />
      </div>

      {walletStats && walletStats.byCurrency.length > 0 ? (
        <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="mb-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Wallet balances by currency
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {walletStats.byCurrency.map((row) => (
              <div key={row.currency} className="rounded-lg border border-hairline px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">{row.currency}</span>
                  <span className="text-[10px] text-muted-foreground">{row.wallets}</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-bold text-ink tabular-nums">
                  {money(row.balance, row.currency)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-lg border border-hairline bg-surface p-1">
        {canViewWallets ? (
          <TabButton active={tab === 'wallets'} onClick={() => setTab('wallets')}>
            User wallets
          </TabButton>
        ) : null}
        {canViewWallets ? (
          <TabButton active={tab === 'transactions'} onClick={() => setTab('transactions')}>
            Transactions
          </TabButton>
        ) : null}
        {canViewPayouts ? (
          <TabButton active={tab === 'payouts'} onClick={() => setTab('payouts')}>
            Payout queue
          </TabButton>
        ) : null}
        {canViewPayouts ? (
          <TabButton active={tab === 'approvals'} onClick={() => setTab('approvals')}>
            Withdrawal approvals
          </TabButton>
        ) : null}
      </div>

      {tab === 'wallets' && canViewWallets ? <WalletsTab /> : null}
      {tab === 'transactions' && canViewWallets ? (
        <TransactionsTab active={tab === 'transactions'} />
      ) : null}
      {tab === 'payouts' && canViewPayouts ? <PayoutQueueTab active={tab === 'payouts'} /> : null}
      {tab === 'approvals' && canViewPayouts ? (
        <WithdrawalApprovalsTab active={tab === 'approvals'} />
      ) : null}
    </div>
  );
}

function WalletsTab() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WalletStatusValue | ''>('');
  const [currency, setCurrency] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isError, error } = useWallets({
    search: search || undefined,
    status: status || undefined,
    currency: currency || undefined,
    page,
    pageSize,
  });
  const wallets = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <Card>
      <FilterBar>
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search user name or email…" />
        <FilterSelect value={status} onChange={(value) => { setStatus(value as WalletStatusValue | ''); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="FROZEN">Frozen</option>
          <option value="CLOSED">Closed</option>
        </FilterSelect>
        <FilterSelect value={currency} onChange={(value) => { setCurrency(value); setPage(1); }}>
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>{code === '' ? 'All currencies' : code}</option>
          ))}
        </FilterSelect>
      </FilterBar>

      {isError ? (
        <ErrorRow message={normaliseError(error).message} />
      ) : isLoading ? (
        <Loading />
      ) : wallets.length === 0 ? (
        <Empty label="No holders match your filters." />
      ) : (
        <>
          {/* One row per person. Said out loud, because a "Balance" column that
              shows one currency out of six is misleading if you do not know
              that is what it is. */}
          <p className="px-5 pb-1 text-[12px] text-muted-foreground">
            One row per holder, showing the wallet with the most money in it. Open a holder to see
            their other currencies.
          </p>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <HeaderCell>Holder</HeaderCell>
                <HeaderCell>Wallet</HeaderCell>
                <HeaderCell>Balance</HeaderCell>
                <HeaderCell>Pending</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell className="text-right">View</HeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((wallet) => (
                <TableRow key={wallet.id} className="hover:bg-muted/40">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                          avatarColor(wallet.user.fullName),
                        )}
                      >
                        {initials(wallet.user.fullName)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-ink">{wallet.user.fullName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {wallet.user.email ?? '-'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-ink">{wallet.currency}</span>
                    {wallet.walletCount > 1 ? (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        of {wallet.walletCount}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'font-semibold',
                      // A funded holder is the reason anyone opens this page,
                      // so the one number that distinguishes them is not left
                      // in the same grey as every zero around it.
                      wallet.balance > 0 ? 'text-ink' : 'text-muted-foreground',
                    )}
                  >
                    {money(wallet.balance, wallet.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {money(wallet.pendingBalance, wallet.currency)}
                  </TableCell>
                  <TableCell>
                    <WalletStatusBadge status={wallet.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/wallets/${wallet.id}`}
                      className="inline-flex items-center gap-1 font-medium text-brand-600 hover:opacity-80"
                    >
                      View <ArrowRight className="size-3.5" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} unit="holder" />
        </>
      )}
    </Card>
  );
}

const WALLET_TX_TYPES: { value: WalletTxTypeValue | ''; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'DEPOSIT', label: 'Deposit' },
  { value: 'WITHDRAWAL', label: 'Withdrawal' },
  { value: 'ESCROW_HOLD', label: 'Escrow hold' },
  { value: 'FEE', label: 'Fee' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'FX_IN', label: 'FX in' },
  { value: 'FX_OUT', label: 'FX out' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
];

/** Global wallet-transaction ledger - every deposit, withdrawal and movement. */
function TransactionsTab({ active }: { active: boolean }) {
  const [type, setType] = useState<WalletTxTypeValue | ''>('');
  const [direction, setDirection] = useState<'' | 'in' | 'out'>('');
  const [currency, setCurrency] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const pageSize = 25;

  const { data, isLoading, isError, error } = useWalletTransactions(
    {
      type: type || undefined,
      direction: direction || undefined,
      currency: currency || undefined,
      search: search || undefined,
      page,
      pageSize,
    },
    active,
  );
  const transactions = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <Card>
      <FilterBar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search user name or email…"
        />
        <FilterSelect
          value={type}
          onChange={(value) => {
            setType(value as WalletTxTypeValue | '');
            setPage(1);
          }}
        >
          {WALLET_TX_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={direction}
          onChange={(value) => {
            setDirection(value as '' | 'in' | 'out');
            setPage(1);
          }}
        >
          <option value="">Money in &amp; out</option>
          <option value="in">Money in</option>
          <option value="out">Money out</option>
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
      </FilterBar>

      {isError ? (
        <ErrorRow message={normaliseError(error).message} />
      ) : isLoading ? (
        <Loading />
      ) : transactions.length === 0 ? (
        <Empty label="No transactions match your filters." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <HeaderCell>Type</HeaderCell>
                <HeaderCell>User</HeaderCell>
                <HeaderCell>Amount</HeaderCell>
                <HeaderCell>Balance after</HeaderCell>
                <HeaderCell>Date</HeaderCell>
                <HeaderCell className="text-right">View</HeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow
                  key={transaction.id}
                  onClick={() => setSelectedTxId(transaction.id)}
                  className="cursor-pointer hover:bg-muted/40"
                >
                  <TableCell className="py-3.5">
                    <WalletTxTypeBadge type={transaction.type} />
                    {transaction.description ? (
                      <div className="mt-1 max-w-55 truncate text-xs text-muted-foreground">
                        {transaction.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-ink">{transaction.user.fullName}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {transaction.user.email ?? '-'}
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'font-semibold tabular-nums',
                      transaction.direction === 'out' ? 'text-amber-600' : 'text-positive',
                    )}
                  >
                    {signedMoney(transaction.amount, transaction.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {money(transaction.balanceAfter, transaction.currency)}
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
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} unit="transaction" />
        </>
      )}

      <WalletTxDetailDrawer id={selectedTxId} onClose={() => setSelectedTxId(null)} />
    </Card>
  );
}

/** Slide-over detail for a single wallet-ledger transaction. */
function WalletTxDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: tx, isLoading, isError, error } = useWalletTransaction(id);
  if (!id) return null;

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
              <WalletTxTypeBadge type={tx.type} />
              <span
                className={cn(
                  'text-lg font-bold tabular-nums',
                  tx.direction === 'out' ? 'text-amber-600' : 'text-positive',
                )}
              >
                {signedMoney(tx.amount, tx.currency)}
              </span>
            </div>

            {tx.description ? (
              <p className="rounded-lg border border-hairline bg-muted/40 px-3 py-2 text-sm text-ink">
                {tx.description}
              </p>
            ) : null}

            <DetailSection title="Transaction">
              <DetailRow label="Reference" value={tx.reference ?? '-'} mono />
              <DetailRow label="Type" value={tx.type} />
              <DetailRow label="Direction" value={tx.direction === 'out' ? 'Money out' : 'Money in'} />
              <DetailRow label="Amount" value={signedMoney(tx.amount, tx.currency)} />
              <DetailRow label="Balance after" value={money(tx.balanceAfter, tx.currency)} />
              <DetailRow label="Currency" value={tx.currency} />
              <DetailRow label="Date" value={formatDateTime(tx.createdAt)} />
              {tx.referenceType ? (
                <DetailRow label="Linked to" value={`${tx.referenceType}${tx.referenceId ? ` · ${tx.referenceId}` : ''}`} mono />
              ) : null}
            </DetailSection>

            <DetailSection title="Account holder">
              <DetailRow label="Name" value={tx.user.fullName} />
              <DetailRow label="Email" value={tx.user.email ?? '-'} />
              {tx.wallet ? <DetailRow label="Wallet status" value={tx.wallet.status} /> : null}
            </DetailSection>

            <Link
              href={`/wallets/${tx.walletId}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
            >
              Open wallet <ExternalLink className="size-3.5" />
            </Link>
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
      <dd className={cn('text-right text-sm font-medium text-ink', mono && 'font-mono text-xs break-all')}>
        {value}
      </dd>
    </div>
  );
}

function PayoutQueueTab({ active }: { active: boolean }) {
  const canManage = usePermission('payouts.manage');
  const [status, setStatus] = useState<PayoutStatusValue | ''>('');
  const [currency, setCurrency] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isError, error } = usePayouts(
    {
      status: status || undefined,
      currency: currency || undefined,
      search: search || undefined,
      page,
      pageSize,
    },
    active,
  );
  const actions = usePayoutActions();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const payouts = data?.items ?? [];
  const total = data?.total ?? 0;
  const busy =
    actions.approve.isPending ||
    actions.hold.isPending ||
    actions.retry.isPending ||
    actions.reject.isPending;

  async function confirmPendingAction(value: string) {
    if (!pendingAction) return;
    try {
      await pendingAction.run(value);
      toast.success(pendingAction.successMessage);
    } catch (actionError) {
      toast.error('Action failed', { description: normaliseError(actionError).message });
    } finally {
      setPendingAction(null);
    }
  }

  async function direct(promise: Promise<unknown>, successMessage: string) {
    try {
      await promise;
      toast.success(successMessage);
    } catch (actionError) {
      toast.error('Action failed', { description: normaliseError(actionError).message });
    }
  }

  return (
    <Card>
      <FilterBar>
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search user name or email…" />
        <FilterSelect value={status} onChange={(value) => { setStatus(value as PayoutStatusValue | ''); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="INITIATED">Pending</option>
          <option value="ON_HOLD">On hold</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </FilterSelect>
        <FilterSelect value={currency} onChange={(value) => { setCurrency(value); setPage(1); }}>
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>{code === '' ? 'All currencies' : code}</option>
          ))}
        </FilterSelect>
      </FilterBar>

      {isError ? (
        <ErrorRow message={normaliseError(error).message} />
      ) : isLoading ? (
        <Loading />
      ) : payouts.length === 0 ? (
        <Empty label="No payouts match your filters." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <HeaderCell>Reference</HeaderCell>
                <HeaderCell>User</HeaderCell>
                <HeaderCell>Amount</HeaderCell>
                <HeaderCell>Method</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Requested</HeaderCell>
                {canManage ? <HeaderCell className="text-right">Actions</HeaderCell> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((payout) => (
                <TableRow key={payout.id} className="hover:bg-muted/40">
                  <TableCell className="py-3.5 font-mono text-xs font-medium text-ink">
                    {payout.reference}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-ink">{payout.user.fullName}</div>
                    <div className="truncate text-xs text-muted-foreground">{payout.user.email}</div>
                  </TableCell>
                  <TableCell className="font-semibold text-ink">
                    {money(payout.amount, payout.currency)}
                    {payout.isExpress ? (
                      <span className="ml-1 text-[10px] font-semibold text-amber-700 uppercase">express</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-ink">
                    {payout.method ? (
                      <>
                        {methodLabel(payout.method.type)}
                        <div className="text-muted-foreground">{payout.method.detail}</div>
                      </>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <PayoutStatusBadge status={payout.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(payout.initiatedAt)}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <PayoutRowActions
                        payout={payout}
                        busy={busy}
                        onApprove={() =>
                          setPendingAction({
                            title: 'Approve this payout?',
                            description: 'Disburses the funds to the payout method via the gateway.',
                            confirmLabel: 'Yes, Approve',
                            tone: 'default',
                            subject: {
                              label: 'Payout',
                              value: `${money(payout.amount, payout.currency)} → ${payout.user.fullName}`,
                            },
                            consequences: [
                              `Sent to ${payout.method ? methodLabel(payout.method.type) : 'the payout method'}`,
                              'The payout is marked COMPLETED',
                              'Recorded in the audit log with your operator ID',
                            ],
                            successMessage: 'Payout approved',
                            run: () => actions.approve.mutateAsync(payout.id),
                          })
                        }
                        onHold={() => direct(actions.hold.mutateAsync(payout.id), 'Payout held')}
                        onRetry={() =>
                          setPendingAction({
                            title: 'Retry this payout?',
                            description: 'Re-attempts the gateway disbursement.',
                            confirmLabel: 'Yes, Retry',
                            tone: 'default',
                            subject: {
                              label: 'Payout',
                              value: `${money(payout.amount, payout.currency)} → ${payout.user.fullName}`,
                            },
                            successMessage: 'Payout retried',
                            run: () => actions.retry.mutateAsync(payout.id),
                          })
                        }
                        onReject={() =>
                          setPendingAction({
                            title: 'Reject this payout?',
                            description: 'Fails the payout and refunds the amount to the wallet.',
                            confirmLabel: 'Yes, Reject',
                            tone: 'danger',
                            subject: {
                              label: 'Payout',
                              value: `${money(payout.amount, payout.currency)} → ${payout.user.fullName}`,
                            },
                            consequences: [
                              'The amount is refunded to the user’s wallet',
                              'The payout is marked FAILED',
                              'Recorded in the audit log with your operator ID',
                            ],
                            input: {
                              label: 'Reason (required)',
                              placeholder: 'Why is this payout being rejected…',
                              required: true,
                              minLength: 3,
                            },
                            successMessage: 'Payout rejected & refunded',
                            run: (value) => actions.reject.mutateAsync({ id: payout.id, reason: value }),
                          })
                        }
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} unit="payout" />
        </>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(next) => {
          if (!next) setPendingAction(null);
        }}
        title={pendingAction?.title ?? ''}
        description={pendingAction?.description}
        confirmLabel={pendingAction?.confirmLabel}
        tone={pendingAction?.tone}
        subject={pendingAction?.subject}
        consequences={pendingAction?.consequences}
        input={pendingAction?.input}
        onConfirm={confirmPendingAction}
      />
    </Card>
  );
}

function WithdrawalApprovalsTab({ active }: { active: boolean }) {
  const canManage = usePermission('payouts.manage');
  const { data, isLoading, isError, error } = useWithdrawalHolds(active);
  const { data: rail } = usePayoutRail(active);
  const actions = useWithdrawalHoldActions();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const holds = data ?? [];
  const busy = actions.approve.isPending || actions.reject.isPending || actions.markPaid.isPending;
  // Fapshi keeps collection and disbursement as separate services, so payouts
  // may have to be sent by hand until a payout-enabled service is activated.
  const manualOnly = rail ? !rail.automatic : false;

  async function confirmPendingAction(value: string) {
    if (!pendingAction) return;
    try {
      await pendingAction.run(value);
      toast.success(pendingAction.successMessage);
    } catch (actionError) {
      toast.error('Action failed', { description: normaliseError(actionError).message });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Card>
      <div className="border-b border-hairline px-6 py-4">
        <p className="text-sm font-semibold text-ink">Withdrawals awaiting approval</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Large CEMAC (XAF) mobile-money withdrawals held for manual review. Approve to disburse, or
          reject to refund the reservation.
        </p>
        {manualOnly ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Automatic payouts are not available.</strong> Every withdrawal waits here. Send
            the money yourself (Fapshi dashboard or mobile money), then use <strong>Mark as paid</strong>{' '}
            with the transfer reference. The user&rsquo;s funds are already reserved, so nothing moves
            twice.{rail?.reason ? ` (${rail.reason})` : ''}
          </p>
        ) : rail && rail.balance !== null ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Payout rail balance: <strong className="text-ink">{money(rail.balance, rail.currency ?? 'XAF')}</strong>
          </p>
        ) : null}
      </div>

      {isError ? (
        <ErrorRow message={normaliseError(error).message} />
      ) : isLoading ? (
        <Loading />
      ) : holds.length === 0 ? (
        <Empty label="No withdrawals awaiting approval." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <HeaderCell>User</HeaderCell>
              <HeaderCell>Amount</HeaderCell>
              <HeaderCell>Provider</HeaderCell>
              <HeaderCell>Phone number</HeaderCell>
              <HeaderCell>Reference</HeaderCell>
              <HeaderCell>Waiting since</HeaderCell>
              {canManage ? <HeaderCell className="text-right">Actions</HeaderCell> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {holds.map((hold) => (
              <TableRow key={hold.id} className="hover:bg-muted/40">
                <TableCell className="py-3.5">
                  <div className="font-medium text-ink">{hold.user.fullName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {hold.user.email ?? '-'}
                  </div>
                </TableCell>
                <TableCell className="font-semibold text-ink">
                  {money(hold.amount, hold.currency)}
                </TableCell>
                <TableCell className="text-xs text-ink">{methodLabel(hold.provider)}</TableCell>
                <TableCell className="font-mono text-xs text-ink">{hold.phoneNumber}</TableCell>
                <TableCell className="font-mono text-xs font-medium text-ink">
                  {hold.reference}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {waitingSince(hold.createdAt)}
                  </span>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <ActionBtn
                        onClick={() =>
                          setPendingAction({
                            title: 'Approve this withdrawal?',
                            description:
                              'Sends the mobile-money disbursement to the user via the provider.',
                            confirmLabel: 'Yes, Approve',
                            tone: 'default',
                            subject: {
                              label: 'Withdrawal',
                              value: `${money(hold.amount, hold.currency)} → ${hold.user.fullName}`,
                            },
                            consequences: [
                              `Disbursed via ${methodLabel(hold.provider)} to ${hold.phoneNumber}`,
                              'The reserved funds are released and sent',
                              'Recorded in the audit log with your operator ID',
                            ],
                            successMessage: 'Withdrawal approved & sent',
                            run: () => actions.approve.mutateAsync(hold.id),
                          })
                        }
                        disabled={busy}
                        tone="positive"
                        icon={CheckCircle2}
                        label="Approve"
                      />
                      <ActionBtn
                        onClick={() =>
                          setPendingAction({
                            title: 'Mark this withdrawal as paid?',
                            description:
                              'Use this only after you have actually sent the money outside the platform.',
                            confirmLabel: 'Yes, it is paid',
                            tone: 'warning',
                            subject: {
                              label: 'Withdrawal',
                              value: `${money(hold.amount, hold.currency)} → ${hold.user.fullName}`,
                            },
                            consequences: [
                              `You confirm ${money(hold.amount, hold.currency)} reached ${hold.phoneNumber}`,
                              'The reserved funds are closed out - the user is NOT charged again',
                              'The reference you enter is stored for reconciliation',
                              'Recorded in the audit log with your operator ID',
                            ],
                            input: {
                              label: 'Transfer reference (required)',
                              placeholder: 'e.g. the Fapshi or MoMo transaction ID',
                              required: true,
                              minLength: 3,
                            },
                            successMessage: 'Withdrawal recorded as paid',
                            run: (reference) => actions.markPaid.mutateAsync({ id: hold.id, reference }),
                          })
                        }
                        disabled={busy}
                        tone="neutral"
                        icon={Banknote}
                        label="Mark as paid"
                      />
                      <ActionBtn
                        onClick={() =>
                          setPendingAction({
                            title: 'Reject this withdrawal?',
                            description: 'Refunds the reservation to the wallet and fails the request.',
                            confirmLabel: 'Yes, Reject',
                            tone: 'danger',
                            subject: {
                              label: 'Withdrawal',
                              value: `${money(hold.amount, hold.currency)} → ${hold.user.fullName}`,
                            },
                            consequences: [
                              'The reserved amount is refunded to the user’s wallet',
                              'The withdrawal is marked FAILED',
                              'Recorded in the audit log with your operator ID',
                            ],
                            input: {
                              label: 'Reason (required)',
                              placeholder: 'Why is this withdrawal being rejected…',
                              required: true,
                              minLength: 3,
                            },
                            successMessage: 'Withdrawal rejected & refunded',
                            run: (reason) => actions.reject.mutateAsync({ id: hold.id, reason }),
                          })
                        }
                        disabled={busy}
                        tone="negative"
                        icon={X}
                        label="Reject"
                      />
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(next) => {
          if (!next) setPendingAction(null);
        }}
        title={pendingAction?.title ?? ''}
        description={pendingAction?.description}
        confirmLabel={pendingAction?.confirmLabel}
        tone={pendingAction?.tone}
        subject={pendingAction?.subject}
        consequences={pendingAction?.consequences}
        input={pendingAction?.input}
        onConfirm={confirmPendingAction}
      />
    </Card>
  );
}

function PayoutRowActions({
  payout,
  busy,
  onApprove,
  onHold,
  onRetry,
  onReject,
}: {
  payout: PayoutRequest;
  busy: boolean;
  onApprove: () => void;
  onHold: () => void;
  onRetry: () => void;
  onReject: () => void;
}) {
  const pending = payout.status === 'INITIATED' || payout.status === 'PROCESSING';
  const onHoldStatus = payout.status === 'ON_HOLD';
  const failed = payout.status === 'FAILED';
  if (payout.status === 'COMPLETED') {
    return <span className="text-xs text-muted-foreground">Sent</span>;
  }
  return (
    <div className="flex justify-end gap-1.5">
      {pending || onHoldStatus ? (
        <ActionBtn onClick={onApprove} disabled={busy} tone="positive" icon={CheckCircle2} label="Approve" />
      ) : null}
      {pending ? (
        <ActionBtn onClick={onHold} disabled={busy} tone="neutral" icon={PauseCircle} label="Hold" />
      ) : null}
      {failed ? (
        <ActionBtn onClick={onRetry} disabled={busy} tone="neutral" icon={RotateCw} label="Retry" />
      ) : null}
      {pending || onHoldStatus ? (
        <ActionBtn onClick={onReject} disabled={busy} tone="negative" icon={X} label="Reject" />
      ) : null}
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  tone,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  tone: 'positive' | 'negative' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const toneClass =
    tone === 'positive'
      ? 'border-positive/30 text-positive hover:bg-positive-bg/50'
      : tone === 'negative'
        ? 'border-negative/40 text-negative hover:bg-negative-bg/50'
        : 'border-field text-ink hover:bg-muted';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50',
        toneClass,
      )}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}

// ---- Shared bits ----

function StatCard({
  label,
  value,
  note,
  tone = 'muted',
}: {
  label: string;
  value?: number;
  note?: string;
  tone?: 'brand' | 'warning' | 'negative' | 'muted';
}) {
  const toneClass =
    tone === 'brand'
      ? 'text-brand-600'
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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {children}
    </div>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-hairline px-6 py-4 lg:flex-row lg:items-center">
      {children}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex-1">
      <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-field bg-white pr-3 pl-10 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
      />
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

function Empty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <WalletIcon className="size-8 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return <div className="p-6 text-sm text-destructive">{message}</div>;
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
        <span className="text-xs">Page {page} of {totalPages}</span>
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

function NoAccess({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <Lock className="size-6" />
      </span>
      <p className="text-sm font-semibold text-ink">No access</p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
