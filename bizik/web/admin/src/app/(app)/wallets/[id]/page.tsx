'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, CreditCard, Loader2, Lock } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { avatarColor, initials } from '@/lib/avatar';
import { useWallet } from '@/features/wallets/hooks';
import {
  PayoutStatusBadge,
  WalletStatusBadge,
  methodLabel,
  money,
} from '@/features/wallets/wallets-ui';
import type { HolderWallet } from '@/features/wallets/types';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WalletDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canView = usePermission('wallets.view');
  const { data: wallet, isLoading, isError, error } = useWallet(id);

  if (!canView) return <NoAccess />;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !wallet) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {isError ? normaliseError(error).message : 'Wallet not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            avatarColor(wallet.user.fullName),
          )}
        >
          {initials(wallet.user.fullName)}
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-ink">{wallet.user.fullName}</h1>
            <WalletStatusBadge status={wallet.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {wallet.user.email}
            {wallet.user.id ? (
              <>
                {' · '}
                <Link href={`/users/${wallet.user.id}`} className="text-brand-600 hover:opacity-80">
                  View account
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* Currency switcher */}
      <WalletSwitcher wallets={wallet.holderWallets} currentId={wallet.id} />

      {/* Balances */}
      <div className="grid gap-4 sm:grid-cols-2">
        <BalanceCard label={`Balance (${wallet.currency})`} value={money(wallet.balance, wallet.currency)} />
        <BalanceCard
          label="Pending"
          value={money(wallet.pendingBalance, wallet.currency)}
          tone="muted"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: transactions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Transactions ({wallet.transactions.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {wallet.transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                wallet.transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {transaction.description ??
                          transaction.type.toLowerCase().replace(/_/g, ' ')}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {transaction.reference ?? transaction.type} ·{' '}
                        {formatDateTime(transaction.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          'text-sm font-semibold',
                          transaction.amount >= 0 ? 'text-positive' : 'text-ink',
                        )}
                      >
                        {transaction.amount >= 0 ? '+' : '−'}
                        {money(Math.abs(transaction.amount), transaction.currency)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        bal {money(transaction.balanceAfter, transaction.currency)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: payout methods + payouts */}
        <div className="space-y-5 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Payout methods ({wallet.payoutMethods.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {wallet.payoutMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payout methods on file.</p>
              ) : (
                wallet.payoutMethods.map((method) => (
                  <div
                    key={method.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-hairline px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-ink">{methodLabel(method.type)}</p>
                        <p className="text-xs text-muted-foreground">{method.detail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {method.isDefault ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 uppercase">
                          Default
                        </span>
                      ) : null}
                      {method.verified ? (
                        <CheckCircle2 className="size-3.5 text-positive" />
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payouts ({wallet.payouts.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {wallet.payouts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payouts.</p>
              ) : (
                wallet.payouts.map((payout) => (
                  <div key={payout.id} className="flex items-center justify-between gap-2 text-sm">
                    <div>
                      <p className="font-medium text-ink">{money(payout.amount, payout.currency)}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {payout.reference}
                      </p>
                    </div>
                    <PayoutStatusBadge status={payout.status} />
                  </div>
                ))
              )}
              <Link
                href="/wallets"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:opacity-80"
              >
                Open payout queue <ArrowRight className="size-3" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * The holder's other currencies.
 *
 * The list page shows one wallet per person, so this is the only way to reach
 * the rest. It is a row of links rather than a dropdown because the balance
 * matters as much as the currency code: an operator checking whether somebody
 * holds funds anywhere should be able to see that without opening a menu and
 * clicking through six of them.
 *
 * Hidden entirely for a holder with a single wallet, where there is nothing to
 * switch to.
 */
function WalletSwitcher({
  wallets,
  currentId,
}: {
  wallets: HolderWallet[];
  currentId: string;
}) {
  if (wallets.length < 2) return null;

  return (
    <section className="rounded-lg border border-hairline bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        This holder&apos;s wallets ({wallets.length})
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {wallets.map((entry) => {
          const current = entry.id === currentId;
          return (
            <Link
              key={entry.id}
              href={`/wallets/${entry.id}`}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'rounded-lg border px-3 py-2.5 transition',
                current
                  ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/20'
                  : 'border-hairline hover:border-brand-200 hover:bg-muted/40',
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={cn('text-xs font-semibold', current ? 'text-brand-700' : 'text-ink')}>
                  {entry.currency}
                </span>
                {entry.status !== 'ACTIVE' ? (
                  <span className="text-[9px] font-bold text-negative uppercase">
                    {entry.status}
                  </span>
                ) : null}
              </div>
              <p
                className={cn(
                  'mt-0.5 truncate text-sm font-bold tabular-nums',
                  // Funded wallets read as the ones worth opening; the zeroes
                  // stay quiet rather than competing with them.
                  entry.balance > 0 ? 'text-ink' : 'text-muted-foreground',
                )}
              >
                {money(entry.balance, entry.currency)}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function BalanceCard({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: string;
  tone?: 'ink' | 'muted';
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold', tone === 'muted' ? 'text-muted-foreground' : 'text-ink')}>
        {value}
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/wallets"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
    >
      <ArrowLeft className="size-4" /> Wallets &amp; payouts
    </Link>
  );
}

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <Lock className="size-6" />
      </span>
      <p className="text-sm font-semibold text-ink">No access</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        You don’t have permission to view this wallet.
      </p>
    </div>
  );
}
