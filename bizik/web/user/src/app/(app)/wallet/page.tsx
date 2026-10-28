'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ChevronRight,
  CreditCard,
  Landmark,
  Loader2,
  Lock,
  Plus,
  AtSign,
  Copy,
  Receipt,
  Send,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';

import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { TX_KIND_META, TX_TILE } from '@/components/wallet/tx-meta';
import type { PayoutKind, PayoutMethod, WalletTransaction } from '@/lib/api/wallet.api';
import type { TxKind } from '@/lib/demo/transactions';
import { usePayoutMethods } from '@/lib/hooks/use-payouts';
import { useMyHandle } from '@/lib/hooks/use-transfer';
import { useWallet, useWalletTransactions } from '@/lib/hooks/use-wallet';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Icon/tile per payout category (matches the backend `PayoutMethod.kind`). */
const PAYOUT_META: Record<PayoutKind, { icon: LucideIcon; tile: string }> = {
  momo: { icon: Smartphone, tile: 'bg-warning-bg text-warning-text' },
  bank: { icon: Landmark, tile: 'bg-brand-50 text-brand-600' },
  payoneer: { icon: CreditCard, tile: 'bg-cyan-bg text-cyan-text' },
};

/** Display name + region badge per currency (used by the desktop "Holdings by currency" panel). */
const CURRENCY_META: Record<string, { name: string; region: string }> = {
  NGN: { name: 'Nigerian Naira', region: 'NG' },
  USD: { name: 'US Dollar', region: 'US' },
  GHS: { name: 'Ghanaian Cedi', region: 'GH' },
  EUR: { name: 'Euro', region: 'EU' },
  GBP: { name: 'British Pound', region: 'GB' },
  XAF: { name: 'Central African CFA Franc', region: 'CM' },
};

const BADGE_TONE: Record<'default' | 'verified' | 'pending', StatusTone> = {
  default: 'brand',
  verified: 'positive',
  pending: 'warning',
};

/** Backend reference type → the shared `TxKind` (drives the row icon/tone). */
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

/** The recent-ledger badge is derived from the real fields (default → verified → pending). */
function payoutBadge(method: PayoutMethod): 'default' | 'verified' | 'pending' {
  if (method.isDefault) return 'default';
  if (method.verified) return 'verified';
  return 'pending';
}

function txKind(entry: WalletTransaction): TxKind {
  return KIND_BY_TYPE[entry.type] ?? (entry.amount < 0 ? 'withdraw' : 'walletTopup');
}

export default function WalletPage() {
  const { t } = useTranslation();
  const { homeCurrency, walletBalance, walletBalanceUsd, inEscrow, overview, isLoading, isError, refetch } =
    useWallet();
  const { data: transactionsData } = useWalletTransactions();
  const { data: payoutMethodsData } = usePayoutMethods();

  const cur = homeCurrency;
  const wallets = overview?.wallets ?? [];
  const pendingPayout = overview?.summary.pendingPayoutHome ?? 0;
  const payoutMethods = payoutMethodsData ?? [];
  const allTransactions = transactionsData ?? [];
  const recentTransactions = allTransactions.slice(0, 5);
  // "Completed" = total value of settled money-in (real ledger; non-failed inflows).
  const completedTotal = allTransactions
    .filter((entry) => entry.amount > 0 && entry.status !== 'failed')
    .reduce((runningTotal, entry) => runningTotal + entry.amount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-3 py-20 text-center">
        <p className="text-[13px] text-negative">{t('wallet.loadError')}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-xl border border-hairline px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-muted"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* ══════════ MOBILE ══════════ */}
      <div className="space-y-6 md:hidden">
        {/* Hero - full-bleed (no top/side margin) */}
        <section className="bg-wallet-gradient -mx-4 -mt-4 rounded-b-[28px] px-5 pb-6 pt-5 text-white">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-extrabold">{t('nav.wallet')}</h1>
            <Link
              href="/wallet/convert"
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-white/15"
            >
              <ArrowLeftRight className="size-4" />
              {t('wallet.convert')}
            </Link>
          </div>

          <p className="mt-5 text-[13px] text-white/60">
            {t('wallet.availableBalance')} · {cur}
          </p>
          <p className="text-[34px] font-extrabold leading-none tracking-[-1px]">
            {formatMoney(walletBalance, cur)}
          </p>
          <p className="mt-1.5 text-[13px] text-white/50">
            ≈ {formatMoney(walletBalanceUsd, 'USD')} USD
          </p>

          <div className="mt-4 flex gap-3">
            <div className="flex-1 rounded-2xl bg-white/10 p-3.5">
              <p className="flex items-center gap-1.5 text-[12px] text-white/60">
                <Lock className="size-3.5" /> {t('wallet.inEscrow')}
              </p>
              <p className="mt-1 text-[15px] font-bold">{formatMoney(inEscrow, cur, 0)}</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3.5">
              <ShieldCheck className="size-4 shrink-0 text-positive-text" />
              <span className="text-[12px] font-bold leading-tight text-positive-text">
                {t('dashboard.fundsProtected')}
              </span>
            </div>
          </div>

          <HandleCard />

          <div className="mt-4 grid grid-cols-4 gap-2.5">
            <Link
              href="/wallet/add"
              className="bg-primary shadow-brand flex flex-col items-center gap-1.5 rounded-2xl py-3 text-white"
            >
              <Plus className="size-5" />
              <span className="text-[12px] font-semibold">{t('wallet.addMoney')}</span>
            </Link>
            <Link
              href="/wallet/send"
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/10 py-3 text-white transition hover:bg-white/15"
            >
              <Send className="size-5" />
              <span className="text-[12px] font-semibold">{t('transfer.send.navTitle')}</span>
            </Link>
            <Link
              href="/wallet/withdraw"
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/10 py-3 text-white transition hover:bg-white/15"
            >
              <ArrowDownToLine className="size-5" />
              <span className="text-[12px] font-semibold">{t('wallet.withdraw')}</span>
            </Link>
            <Link
              href="/wallet/transactions"
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/10 py-3 text-white transition hover:bg-white/15"
            >
              <Receipt className="size-5" />
              <span className="text-[12px] font-semibold">{t('wallet.transactions')}</span>
            </Link>
          </div>
        </section>

        {/* Recent transactions */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">{t('wallet.transactions')}</h2>
            <Link href="/wallet/transactions" className="text-[13px] font-semibold text-brand-600">
              {t('wallet.seeAll')}
            </Link>
          </div>
          {recentTransactions.length === 0 ? (
            <div className="shadow-card rounded-2xl border border-hairline bg-surface px-4 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">{t('tx.empty')}</p>
            </div>
          ) : (
            <div className="shadow-card divide-y divide-[#F1F5FA] overflow-hidden rounded-2xl border border-hairline bg-surface">
              {recentTransactions.map((entry) => {
                const kind = txKind(entry);
                const meta = TX_KIND_META[kind];
                const positive = entry.amount >= 0;
                return (
                  <Link
                    key={entry.id}
                    href="/wallet/transactions"
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#F8FAFC]"
                  >
                    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TX_TILE[meta.tone])}>
                      <meta.icon className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-ink">{entry.title}</p>
                      <p className="truncate text-[11.5px] text-muted-foreground">
                        {entry.subtitle || entry.group}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          'text-[13.5px] font-bold',
                          positive ? 'text-positive-text' : 'text-negative-text',
                        )}
                      >
                        {positive ? '+ ' : '- '}
                        {formatMoney(Math.abs(entry.amount), entry.currency)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{entry.date}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Payout methods */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">{t('wallet.payoutMethods')}</h2>
            <Link href="/settings/payouts" className="text-[13px] font-semibold text-brand-600">
              {t('wallet.manage')}
            </Link>
          </div>
          {payoutMethods.length === 0 ? (
            <div className="shadow-card rounded-2xl border border-hairline bg-surface px-4 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">{t('wallet.noPayoutMethods')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payoutMethods.map((method) => {
                const meta = PAYOUT_META[method.kind];
                const badge = payoutBadge(method);
                return (
                  <div
                    key={method.id}
                    className="shadow-card flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-4 py-3.5"
                  >
                    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', meta.tile)}>
                      <meta.icon className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-ink">{method.name}</p>
                      <p className="text-[12px] text-muted-foreground">{method.detail}</p>
                    </div>
                    <StatusPill tone={BADGE_TONE[badge]}>{t(`wallet.badge.${badge}`)}</StatusPill>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ══════════ DESKTOP ══════════ */}
      <div className="hidden gap-6 md:grid lg:grid-cols-[1.6fr_1fr]">
      {/* ── Left column ── */}
      <div className="space-y-6">
        {/* Balance hero */}
        <section className="bg-wallet-gradient shadow-card rounded-2xl p-5 text-white md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-white/70">
                {t('wallet.availableBalance')} · {cur}
              </p>
              <p className="mt-1 text-[32px] font-extrabold leading-none -tracking-[1px] md:text-[36px]">
                {formatMoney(walletBalance, cur)}
              </p>
              <p className="mt-1.5 text-sm text-white/50">
                ≈ {formatMoney(walletBalanceUsd, 'USD')} USD
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/wallet/add"
                className="bg-primary shadow-brand flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
              >
                <Plus className="size-4" /> {t('wallet.addMoney')}
              </Link>
              <Link
                href="/wallet/withdraw"
                className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                {t('wallet.withdraw')}
              </Link>
              <Link
                href="/wallet/convert"
                className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                {t('wallet.convert')}
              </Link>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SubTile label={t('wallet.inEscrow')} value={formatMoney(inEscrow, cur)} />
            <SubTile label={t('wallet.payoutProcessing')} value={formatMoney(pendingPayout, cur)} />
            <SubTile label={t('wallet.completed')} value={formatMoney(completedTotal, cur)} />
          </div>
        </section>

        {/* Transactions */}
        <section className="shadow-card rounded-2xl border border-hairline bg-surface">
          <div className="flex items-center justify-between px-5 pb-2.5 pt-4">
            <h2 className="text-sm font-bold text-ink">{t('wallet.transactions')}</h2>
            <Link
              href="/wallet/transactions"
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              {t('wallet.seeAll')}
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-y border-hairline text-left text-[10.5px] uppercase tracking-wider text-subtle">
                  <th className="px-5 py-2.5 font-bold">{t('wallet.table.description')}</th>
                  <th className="px-3 py-2.5 font-bold">{t('wallet.table.deal')}</th>
                  <th className="px-3 py-2.5 text-right font-bold">{t('wallet.table.amount')}</th>
                  <th className="px-5 py-2.5 font-bold">{t('wallet.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((entry) => {
                  const kind = txKind(entry);
                  const meta = TX_KIND_META[kind];
                  const positive = entry.amount >= 0;
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-[#F1F5FA] transition last:border-0 hover:bg-[#FBFDFF]"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-xl',
                              TX_TILE[meta.tone],
                            )}
                          >
                            <meta.icon className="size-4" />
                          </span>
                          <div>
                            <p className="font-semibold text-ink">{entry.title}</p>
                            <p className="text-[11px] text-muted-foreground">{entry.date}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{entry.subtitle || '-'}</td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-3 py-3 text-right font-bold',
                          positive ? 'text-positive-text' : 'text-negative-text',
                        )}
                      >
                        {positive ? '+ ' : '- '}
                        {formatMoney(Math.abs(entry.amount), entry.currency)}
                      </td>
                      <td className="px-5 py-3">
                        {(() => {
                          const entryStatus = entry.status ?? 'completed';
                          const statusTone: StatusTone =
                            entryStatus === 'completed'
                              ? 'positive'
                              : entryStatus === 'failed'
                                ? 'negative'
                                : 'warning';
                          return <StatusPill tone={statusTone}>{t(`wallet.status.${entryStatus}`)}</StatusPill>;
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ── Right column ── */}
      <div className="space-y-6">
        {/* Holdings by currency */}
        <section className="shadow-card rounded-2xl border border-hairline bg-surface">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
            <h2 className="text-sm font-bold text-ink">{t('wallet.yourCurrencies')}</h2>
            <Link href="/wallet/convert" className="text-[13px] font-semibold text-brand-600">
              {t('wallet.convert')}
            </Link>
          </div>
          <ul className="divide-y divide-[#F1F5FA]">
            {wallets.map((wallet) => {
              const meta = CURRENCY_META[wallet.currency];
              const changePct = wallet.changePct ?? 0;
              const isUp = changePct >= 0;
              return (
                <li key={wallet.currency}>
                  <Link
                    href="/wallet/transactions"
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#F8FAFC]"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl">
                      {wallet.flag ?? meta?.region ?? wallet.currency}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-bold text-ink">{wallet.currency}</p>
                      <p className="truncate text-[11.5px] text-muted-foreground">
                        {meta?.name ?? wallet.label}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13.5px] font-bold text-ink">
                        {formatMoney(wallet.balance, wallet.currency, wallet.currency === 'USD' ? 2 : 0)}
                      </p>
                      <p className={`text-[11.5px] font-semibold ${isUp ? 'text-positive-text' : 'text-negative'}`}>
                        {isUp ? '▲' : '▼'} {Math.abs(changePct)}%
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Payout methods */}
        <section className="shadow-card rounded-2xl border border-hairline bg-surface">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
            <h2 className="text-sm font-bold text-ink">{t('wallet.payoutMethods')}</h2>
            <Link
              href="/settings/payouts"
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              {t('wallet.manage')}
            </Link>
          </div>
          {payoutMethods.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-[13px] text-muted-foreground">{t('wallet.noPayoutMethods')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#F1F5FA]">
              {payoutMethods.map((method) => {
                const meta = PAYOUT_META[method.kind];
                const badge = payoutBadge(method);
                return (
                  <li key={method.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl',
                        meta.tile,
                      )}
                    >
                      <meta.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-bold text-ink">{method.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">{method.detail}</p>
                    </div>
                    <StatusPill tone={BADGE_TONE[badge]}>{t(`wallet.badge.${badge}`)}</StatusPill>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
    </>
  );
}


/**
 * How money comes IN: the user's public handle. Anyone on BiZik can pay it
 * without knowing their phone number, so it is worth a permanent, copyable spot
 * on the wallet rather than a screen people have to go looking for.
 */
function HandleCard() {
  const { t } = useTranslation();
  const { data } = useMyHandle();
  if (!data?.username) return null;
  const handle = `@${data.username}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handle);
      toast.success(t('transfer.receive.copied'));
    } catch {
      toast.error(handle);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={t('transfer.receive.body')}
      className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-left text-white transition hover:bg-white/15"
    >
      <AtSign className="size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wider opacity-80">
          {t('transfer.receive.yourHandle')}
        </span>
        <span className="block truncate text-[16px] font-extrabold">{handle}</span>
      </span>
      <Copy className="size-4 shrink-0 opacity-80" />
    </button>
  );
}

function SubTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <p className="text-[12px] text-white/60">{label}</p>
      <p className="mt-1 text-base font-bold text-white">{value}</p>
    </div>
  );
}
