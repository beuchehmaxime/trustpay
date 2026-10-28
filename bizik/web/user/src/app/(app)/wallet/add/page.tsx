'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CreditCard,
  Landmark,
  Loader2,
  Plus,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';

import { ProviderLogo } from '@/components/ui/provider-logo';
import { normaliseError } from '@/lib/api/client';
import { useTransferQuote } from '@/lib/hooks/use-transfer-quote';
import type { PayoutMethod } from '@/lib/api/wallet.api';
import { useWallet, useWalletTransactions } from '@/lib/hooks/use-wallet';
import { useCreateDeposit, usePaymentTransaction } from '@/lib/hooks/use-payments';
import { usePayoutMethods } from '@/lib/hooks/use-payouts';
import { currencySymbol, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const QUICK_CHIPS = [
  { value: 50_000, short: '50k' },
  { value: 250_000, short: '250k' },
  { value: 500_000, short: '500k' },
  { value: 1_000_000, short: '1M' },
];

/** Icon + tile tint per saved-method kind (mirrors the withdraw screen). */
const KIND_ICON: Record<string, LucideIcon> = {
  bank: Landmark,
  momo: Smartphone,
  payoneer: CreditCard,
};
const KIND_TILE: Record<string, string> = {
  bank: 'bg-brand-50 text-brand-600',
  momo: 'bg-warning-bg text-warning-text',
  payoneer: 'bg-brand-50 text-brand-600',
};
/** Client-side fee estimate per method kind (backend charges the real fee). */
/** How long the success screen shows before we send the user back to /wallet. */
const REDIRECT_DELAY_MS = 2000;

/** Give up on a still-unapproved mobile-money charge a little past the poll ceiling. */
const APPROVAL_TIMEOUT_MS = 125_000;

export default function DepositPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { homeCurrency, walletBalance, walletBalanceUsd } = useWallet();
  const { data: transactions } = useWalletTransactions();
  const { data: payoutMethodsData } = usePayoutMethods();
  const createDeposit = useCreateDeposit();
  const [amount, setAmount] = useState(250_000);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  // The id of a PROCESSING deposit we poll while the user approves it on their phone.
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const paymentPoll = usePaymentTransaction(pendingTransactionId, {
    enabled: Boolean(pendingTransactionId),
  });

  // Payload + display currency follow the user's home wallet currency.
  const CUR = homeCurrency;

  // The saved payment methods the user pays FROM - no "from wallet" source exists
  // for a deposit. Selection defaults to the explicit choice → default → first.
  const payoutMethods = payoutMethodsData ?? [];
  const selectedMethod =
    payoutMethods.find((entry) => entry.id === selectedId) ??
    payoutMethods.find((entry) => entry.isDefault) ??
    payoutMethods[0] ??
    null;

  // "Recent top-ups" - the last few money-in ledger entries (top-up / deposit).
  const recentTopups = (transactions ?? [])
    .filter((entry) => entry.type === 'topup' || entry.type === 'deposit')
    .slice(0, 4);

  // The transfer fee comes from the server, not from a rate copied into this
  // file. The copy that used to live here was a guess (0.5% for mobile money)
  // and the rail actually charges around 3% - so the screen promised one number
  // and the mobile money prompt asked for another.
  const quote = useTransferQuote(amount, 'deposit', CUR, Boolean(selectedMethod));
  const fee = quote.data?.fee ?? 0;
  const feePct = quote.data ? Number((quote.data.rate * 100).toFixed(2)) : 0;
  const total = quote.data?.total ?? amount;
  // Live home→USD rate for the "≈ USD" helper (falls back to a nominal rate).
  const usdPerHome = walletBalance > 0 ? walletBalanceUsd / walletBalance : 1 / 1545;
  const totalUsd = total * usdPerHome;
  const canSubmit = amount > 0 && Boolean(selectedMethod) && !createDeposit.isPending;

  const methodSpeed = (method: PayoutMethod) =>
    method.kind === 'momo' ? t('deposit.instant') : t('deposit.arrives1h');

  // Once the deposit clears, show the success screen for a moment then head to /wallet.
  useEffect(() => {
    if (!succeeded) return;
    const timer = setTimeout(() => router.replace('/wallet'), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [succeeded, router]);

  const confirmDeposit = async () => {
    if (amount <= 0 || !selectedMethod) return;
    try {
      const transaction = await createDeposit.mutateAsync({
        payoutMethodId: selectedMethod.id,
        amount,
        currency: CUR,
      });
      if (transaction.status === 'SUCCESSFUL') {
        // Sync provider (bank / Payoneer / simulator) - settled instantly.
        setSucceeded(true);
      } else if (transaction.status === 'FAILED' || transaction.status === 'REVERSED') {
        toast.error(transaction.failureReason || t('payments.failedDeposit'));
      } else {
        // Mobile money (MTN) - PROCESSING; the user must approve on their phone.
        setPendingTransactionId(transaction.id);
      }
    } catch (error) {
      toast.error(normaliseError(error).message);
    }
  };

  // React to the polled status of a PROCESSING deposit → success or failure.
  const polledStatus = paymentPoll.data?.status;
  const polledFailureReason = paymentPoll.data?.failureReason;
  useEffect(() => {
    if (!pendingTransactionId) return;
    if (polledStatus === 'SUCCESSFUL') {
      setPendingTransactionId(null);
      setSucceeded(true);
    } else if (polledStatus === 'FAILED' || polledStatus === 'REVERSED') {
      setPendingTransactionId(null);
      toast.error(polledFailureReason || t('payments.failedDeposit'));
    }
  }, [pendingTransactionId, polledStatus, polledFailureReason, t]);

  // Stop waiting if the approval never lands - send the user back to the form.
  useEffect(() => {
    if (!pendingTransactionId) return;
    const timer = setTimeout(() => {
      setPendingTransactionId(null);
      toast.message(t('payments.timeout'));
    }, APPROVAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingTransactionId, t]);

  // ───────── Success ─────────
  if (succeeded) {
    return (
      <div className="mx-auto flex w-full max-w-[460px] flex-col items-center py-10 text-center md:py-16">
        <span className="flex size-20 items-center justify-center rounded-full bg-positive-bg text-positive-text">
          <CheckCircle2 className="size-11" />
        </span>
        <h1 className="mt-6 text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('deposit.successTitle')}</h1>
        <p className="mt-2 text-[34px] font-extrabold text-ink">{formatMoney(amount, CUR)}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t('deposit.successBody', { currency: CUR })}</p>
        <button
          type="button"
          onClick={() => router.replace('/wallet')}
          className="bg-primary shadow-brand mt-8 h-12 w-full rounded-xl text-[15px] font-semibold text-white transition hover:opacity-95"
        >
          {t('deposit.done')}
        </button>
        <p className="mt-3 text-[12.5px] text-muted-foreground">{t('deposit.redirecting')}</p>
      </div>
    );
  }

  // ───────── Waiting for phone approval (mobile money PROCESSING) ─────────
  if (pendingTransactionId) {
    return (
      <div className="mx-auto flex w-full max-w-[460px] flex-col items-center py-10 text-center md:py-16">
        <span className="flex size-20 items-center justify-center rounded-full bg-warning-bg text-warning-text">
          <Smartphone className="size-10 animate-pulse" />
        </span>
        <h1 className="mt-6 text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('payments.approveTitle')}</h1>
        <p className="mt-2 text-[34px] font-extrabold text-ink">{formatMoney(amount, CUR)}</p>
        <p className="mt-3 max-w-[340px] text-sm text-muted-foreground">
          {t('payments.approveDeposit', { amount: formatMoney(amount, CUR) })}
        </p>
        <div className="mt-6 flex items-center gap-2 text-[13px] font-semibold text-brand-700">
          <Loader2 className="size-4 animate-spin" />
          {t('payments.waitingHint')}
        </div>
        <button
          type="button"
          onClick={() => setPendingTransactionId(null)}
          className="mt-8 h-11 w-full rounded-xl border border-hairline text-sm font-semibold text-ink transition hover:bg-muted"
        >
          {t('payments.cancel')}
        </button>
      </div>
    );
  }

  // Shared empty state for the "pay from" section (no saved methods).
  const renderEmptyMethods = (
    <div className="rounded-2xl border-[1.5px] border-dashed border-field p-5 text-center">
      <p className="text-[14px] font-bold text-ink">{t('deposit.noMethods')}</p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{t('deposit.noMethodsBody')}</p>
      <Link
        href="/settings/payouts/new"
        className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
      >
        <Plus className="size-4" />
        {t('deposit.addMethod')}
      </Link>
    </div>
  );

  return (
    <>
      {/* ───────── Desktop (two-pane) ───────── */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h1 className="text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('deposit.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('deposit.subtitle')}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          {/* LEFT - form */}
          <div className="shadow-card rounded-2xl border border-hairline bg-surface p-6">
            {/* Step 1 - amount */}
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
                1
              </span>
              <span className="text-sm font-bold text-ink">{t('deposit.amountToAdd')}</span>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-hairline bg-[#F8FBFF] p-4">
              <span className="text-[30px] font-extrabold text-muted-foreground">{currencySymbol(CUR)}</span>
              <input
                inputMode="numeric"
                value={amount ? amount.toLocaleString('en-US') : ''}
                onChange={(event) => setAmount(Number(event.target.value.replace(/[^\d]/g, '')) || 0)}
                className="min-w-0 flex-1 bg-transparent text-[30px] font-extrabold text-ink outline-none"
                aria-label={t('deposit.amountToAdd')}
              />
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-ink">{CUR}</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2.5">
              {QUICK_CHIPS.map((chip) => {
                const active = amount === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setAmount(chip.value)}
                    className={cn(
                      'rounded-xl py-2.5 text-[13px] font-semibold transition',
                      active ? 'bg-brand-50 text-brand-700' : 'bg-muted text-ink hover:bg-[#EBEFF5]',
                    )}
                  >
                    {currencySymbol(CUR)}
                    {chip.short}
                  </button>
                );
              })}
            </div>

            {/* Step 2 - pay from */}
            <div className="mt-6 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
                  2
                </span>
                <span className="text-sm font-bold text-ink">{t('deposit.payFrom')}</span>
              </div>
              {selectedMethod ? (
                <span className="text-[12px] font-semibold text-muted-foreground">
                  {t('deposit.chargeAmount', { amount: formatMoney(total, CUR) })}
                </span>
              ) : null}
            </div>
            <div className="mt-3 space-y-3">
              {payoutMethods.length === 0 ? renderEmptyMethods : null}
              {payoutMethods.map((option) => {
                const isSelected = selectedMethod?.id === option.id;
                const MethodIcon = KIND_ICON[option.kind] ?? Landmark;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedId(option.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl border-[1.5px] p-4 text-left transition',
                      isSelected ? 'border-brand-500 bg-brand-50/40' : 'border-hairline bg-surface hover:border-brand-border',
                    )}
                  >
                    {option.kind === 'momo' ? (
                      <ProviderLogo type={option.type} size={40} />
                    ) : (
                      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', KIND_TILE[option.kind] ?? KIND_TILE.bank)}>
                        <MethodIcon className="size-[18px]" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      {option.kind === 'momo' ? (
                        <>
                          <p className="text-[14px] font-bold text-ink">{option.detail}</p>
                          <p className="text-[12px] text-muted-foreground">{methodSpeed(option)}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[14px] font-bold text-ink">{option.name}</p>
                          <p className="text-[12px] text-muted-foreground">
                            {`${option.detail} · ${methodSpeed(option)}`}
                          </p>
                        </>
                      )}
                    </div>
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border',
                        isSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-field',
                      )}
                    >
                      {isSelected ? <Check className="size-3.5" /> : null}
                    </span>
                  </button>
                );
              })}
              {payoutMethods.length > 0 ? (
                <Link
                  href="/settings/payouts/new"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-field py-3.5 text-sm font-semibold text-brand-600 transition hover:border-brand-border hover:bg-brand-50/40"
                >
                  <Plus className="size-4" />
                  {t('deposit.addMethod')}
                </Link>
              ) : null}
            </div>
          </div>

          {/* RIGHT - summary */}
          <div className="space-y-5">
            <div className="shadow-card rounded-2xl border border-hairline bg-surface p-6">
              <h2 className="text-sm font-bold text-ink">{t('deposit.beforeConfirm')}</h2>
              <dl className="mt-4 space-y-2.5 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('deposit.amount')}</dt>
                  <dd className="font-semibold text-ink">{formatMoney(amount, CUR)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{`${t('deposit.bizikFee')} (${feePct}%)`}</dt>
                  <dd className="font-semibold text-ink">{formatMoney(fee, CUR)}</dd>
                </div>
              </dl>
              <div className="my-4 h-px bg-hairline" />
              <div className="flex items-end justify-between">
                <span className="text-sm font-bold text-ink">{t('deposit.totalCharged')}</span>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-ink">{formatMoney(total, CUR)}</div>
                  <div className="text-[12px] text-muted-foreground">≈ {formatMoney(totalUsd, 'USD')} USD</div>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-positive-bg/50 px-3 py-2.5 text-[12.5px] font-medium text-positive-text">
                {t('deposit.creditedNote', { currency: CUR })}
              </div>
              <button
                type="button"
                onClick={confirmDeposit}
                disabled={!canSubmit}
                className="bg-primary shadow-brand mt-4 h-12 w-full rounded-xl text-[15px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('deposit.cta', { total: formatMoney(total, CUR) })}
              </button>
              <Link
                href="/wallet"
                className="mt-2 flex h-11 w-full items-center justify-center rounded-xl border border-hairline text-sm font-semibold text-ink transition hover:bg-muted"
              >
                {t('deposit.cancel')}
              </Link>
            </div>

            <div className="shadow-card rounded-2xl border border-hairline bg-surface p-6">
              <h2 className="text-sm font-bold text-ink">{t('deposit.recentTopups')}</h2>
              {recentTopups.length > 0 ? (
                <ul className="mt-4 space-y-3 text-[13px]">
                  {recentTopups.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {`${entry.subtitle || entry.title} · ${entry.group}`}
                      </span>
                      <span className="shrink-0 font-bold text-positive-text">
                        {`${entry.amount >= 0 ? '+' : '−'}${formatMoney(Math.abs(entry.amount), entry.currency, 0)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-[13px] text-muted-foreground">{t('deposit.noTopups')}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ───────── Mobile ───────── */}
      <div className="mx-auto w-full max-w-[560px] space-y-4 md:hidden">
      {/* Back (mobile - no top bar) */}
      <Link
        href="/wallet"
        className="flex w-fit items-center gap-1.5 text-[14px] font-semibold text-brand-700 md:hidden"
      >
        <ArrowLeft className="size-4" />
        {t('nav.wallet')}
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('deposit.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('deposit.subtitle')}</p>
      </div>

      {/* Amount card */}
      <section className="shadow-card rounded-2xl border border-hairline bg-surface p-4">
        <p className="text-[12.5px] font-semibold text-muted-foreground">{t('deposit.amountToAdd')}</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-2xl font-bold text-muted-foreground">{currencySymbol(CUR)}</span>
          <input
            inputMode="numeric"
            value={amount ? amount.toLocaleString('en-US') : ''}
            onChange={(event) => setAmount(Number(event.target.value.replace(/[^\d]/g, '')) || 0)}
            className="min-w-0 flex-1 bg-transparent text-[30px] font-extrabold text-ink outline-none"
            aria-label={t('deposit.amountToAdd')}
          />
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-ink">{CUR}</span>
        </div>

        <div className="my-3 h-px bg-hairline" />

        <div className="grid grid-cols-4 gap-2">
          {QUICK_CHIPS.map((chip) => {
            const active = amount === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setAmount(chip.value)}
                className={cn(
                  'rounded-xl py-2.5 text-[13px] font-semibold transition',
                  active ? 'bg-brand-50 text-brand-700' : 'bg-muted text-ink hover:bg-[#EBEFF5]',
                )}
              >
                {currencySymbol(CUR)}
                {chip.short}
              </button>
            );
          })}
        </div>
      </section>

      {/* Pay from */}
      <div>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-ink">{t('deposit.payFrom')}</p>
          {selectedMethod ? (
            <span className="text-[12px] font-semibold text-muted-foreground">
              {t('deposit.chargeAmount', { amount: formatMoney(total, CUR) })}
            </span>
          ) : null}
        </div>
        <div className="space-y-3">
          {payoutMethods.length === 0 ? renderEmptyMethods : null}
          {payoutMethods.map((option) => {
            const isSelected = selectedMethod?.id === option.id;
            const MethodIcon = KIND_ICON[option.kind] ?? Landmark;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedId(option.id)}
                className={cn(
                  'shadow-card flex w-full items-center gap-3 rounded-2xl border-[1.5px] p-4 text-left transition',
                  isSelected ? 'border-brand-500 bg-brand-50/40' : 'border-hairline bg-surface hover:border-brand-border',
                )}
              >
                {option.kind === 'momo' ? (
                  <ProviderLogo type={option.type} size={40} />
                ) : (
                  <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', KIND_TILE[option.kind] ?? KIND_TILE.bank)}>
                    <MethodIcon className="size-[18px]" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {option.kind === 'momo' ? (
                    <>
                      <p className="text-[14px] font-bold text-ink">{option.detail}</p>
                      <p className="text-[12px] text-muted-foreground">{methodSpeed(option)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[14px] font-bold text-ink">{option.name}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {`${option.detail} · ${methodSpeed(option)}`}
                      </p>
                    </>
                  )}
                </div>
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border',
                    isSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-field',
                  )}
                >
                  {isSelected ? <Check className="size-3.5" /> : null}
                </span>
              </button>
            );
          })}
          {payoutMethods.length > 0 ? (
            <Link
              href="/settings/payouts/new"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-field py-3.5 text-sm font-semibold text-brand-600 transition hover:border-brand-border hover:bg-brand-50/40"
            >
              <Plus className="size-4" />
              {t('deposit.addMethod')}
            </Link>
          ) : null}
        </div>
      </div>

      {/* Breakdown */}
      <div className="rounded-2xl bg-[#F5F8FC] p-4">
        <dl className="space-y-2.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('deposit.amount')}</dt>
            <dd className="font-semibold text-ink">{formatMoney(amount, CUR)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('deposit.bizikFee')}</dt>
            <dd className="font-semibold text-ink">{formatMoney(fee, CUR)}</dd>
          </div>
        </dl>
        <div className="my-3 h-px bg-hairline" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">{t('deposit.totalCharged')}</span>
          <span className="text-lg font-extrabold text-ink">{formatMoney(total, CUR)}</span>
        </div>
      </div>

      {/* Actions */}
      <button
        type="button"
        onClick={confirmDeposit}
        disabled={!canSubmit}
        className="bg-primary shadow-brand h-12 w-full rounded-xl text-[15px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t('deposit.cta', { total: formatMoney(total, CUR) })}
      </button>
      <Link
        href="/wallet"
        className="flex h-11 w-full items-center justify-center rounded-xl border border-hairline text-sm font-semibold text-ink transition hover:bg-muted"
      >
        {t('deposit.cancel')}
      </Link>
      </div>
    </>
  );
}
