'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, Check, CreditCard, Landmark, Loader2, Plus, Smartphone, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ProviderLogo } from '@/components/ui/provider-logo';
import { normaliseError } from '@/lib/api/client';
import type { PayoutMethod } from '@/lib/api/wallet.api';
import { useWallet } from '@/lib/hooks/use-wallet';
import { useCreateWithdrawal, usePaymentTransaction } from '@/lib/hooks/use-payments';
import { usePayoutMethods } from '@/lib/hooks/use-payouts';
import { useTransferQuote } from '@/lib/hooks/use-transfer-quote';
import { currencySymbol, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Icon + tile tint per payout-method kind (mirrors the mobile colour system). */
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

/** Give up on a still-unapproved mobile-money disbursement past the poll ceiling. */
const APPROVAL_TIMEOUT_MS = 125_000;

export default function WithdrawPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { homeCurrency, walletBalance, inEscrow } = useWallet();
  const { data: methods } = usePayoutMethods();
  const createWithdrawal = useCreateWithdrawal();

  const [amount, setAmount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The id of a PROCESSING withdrawal we poll while the user approves it on their phone.
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const paymentPoll = usePaymentTransaction(pendingTransactionId, {
    enabled: Boolean(pendingTransactionId),
  });

  const CUR = homeCurrency;
  const available = walletBalance;
  const payoutMethods = methods ?? [];
  // Selected → explicit choice, else the default method, else the first.
  const selected =
    payoutMethods.find((entry) => entry.id === selectedId) ??
    payoutMethods.find((entry) => entry.isDefault) ??
    payoutMethods[0] ??
    null;

  // The transfer fee is charged ON TOP of the amount, so the wallet gives up
  // more than the user typed. That has to be on screen before they confirm,
  // not discovered afterwards in their balance.
  const quote = useTransferQuote(amount, 'withdrawal', CUR, Boolean(selected));
  const transferFee = quote.data?.fee ?? 0;
  const totalDebited = quote.data?.total ?? amount;
  // The balance check is against the TOTAL, matching the backend: checking the
  // amount alone would let someone submit their whole balance and be rejected
  // for insufficient funds they appear to have.
  const overBalance = totalDebited > available;
  const youReceive = Math.max(0, amount);
  const canSubmit = amount > 0 && !overBalance && Boolean(selected) && !createWithdrawal.isPending;

  const arrivalDetail = (method: PayoutMethod) =>
    method.kind === 'bank' ? t('withdraw.arrivesBank') : t('withdraw.instant');

  // A synchronously-settled withdrawal (bank / Payoneer / simulator) is done here.
  const finishWithdrawal = () => {
    toast.success(t('withdraw.successToast'));
    router.push('/wallet');
  };

  const confirmWithdraw = async () => {
    if (!selected || amount <= 0 || overBalance) return;
    try {
      const transaction = await createWithdrawal.mutateAsync({
        payoutMethodId: selected.id,
        amount,
        currency: CUR,
      });
      if (transaction.status === 'SUCCESSFUL') {
        finishWithdrawal();
      } else if (transaction.status === 'FAILED' || transaction.status === 'REVERSED') {
        // Backend auto-refunds the reservation on failure - just surface the error.
        toast.error(transaction.failureReason || t('payments.failedWithdraw'));
      } else {
        // Mobile money (MTN) - PROCESSING; the user must approve on their phone.
        setPendingTransactionId(transaction.id);
      }
    } catch (error) {
      toast.error(normaliseError(error).message);
    }
  };

  // React to the polled status of a PROCESSING withdrawal → success or failure.
  const polledStatus = paymentPoll.data?.status;
  const polledFailureReason = paymentPoll.data?.failureReason;
  useEffect(() => {
    if (!pendingTransactionId) return;
    if (polledStatus === 'SUCCESSFUL') {
      setPendingTransactionId(null);
      finishWithdrawal();
    } else if (polledStatus === 'FAILED' || polledStatus === 'REVERSED') {
      setPendingTransactionId(null);
      toast.error(polledFailureReason || t('payments.failedWithdraw'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTransactionId, polledStatus, polledFailureReason]);

  // Stop waiting if the approval never lands - send the user back to the form.
  useEffect(() => {
    if (!pendingTransactionId) return;
    const timer = setTimeout(() => {
      setPendingTransactionId(null);
      toast.message(t('payments.timeout'));
    }, APPROVAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingTransactionId, t]);

  // ───────── Processing the payout (mobile money PROCESSING) ─────────
  // A withdrawal is PUSHED to the recipient - there's nothing to approve on the
  // phone (unlike a deposit). We just wait for the disbursement to settle.
  if (pendingTransactionId) {
    return (
      <div className="mx-auto flex w-full max-w-[460px] flex-col items-center py-10 text-center md:py-16">
        <span className="flex size-20 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Loader2 className="size-9 animate-spin" />
        </span>
        <h1 className="mt-6 text-2xl font-extrabold tracking-[-0.4px] text-ink">
          {t('payments.withdrawProcessingTitle')}
        </h1>
        <p className="mt-2 text-[34px] font-extrabold text-ink">{formatMoney(amount, CUR)}</p>
        <p className="mt-3 max-w-[340px] text-sm text-muted-foreground">
          {t('payments.withdrawProcessingBody', { amount: formatMoney(amount, CUR) })}
        </p>
        <div className="mt-6 text-[13px] font-medium text-muted-foreground">
          {t('payments.withdrawProcessingHint')}
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

  return (
    <>
      {/* ───────── Desktop (two-pane) ───────── */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h1 className="text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('withdraw.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('withdraw.subtitle')}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          {/* LEFT - form */}
          <div className="shadow-card rounded-2xl border border-hairline bg-surface p-6">
            {/* Balance tiles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-hairline bg-[#F8FBFF] p-4">
                <p className="text-[12px] font-semibold text-muted-foreground">{t('withdraw.availableToWithdraw')}</p>
                <p className="mt-1 text-lg font-extrabold text-ink">{formatMoney(available, CUR)}</p>
              </div>
              <div className="rounded-2xl border border-hairline bg-muted/50 p-4">
                <p className="text-[12px] font-semibold text-muted-foreground">{t('withdraw.lockedInEscrow')}</p>
                <p className="mt-1 text-lg font-extrabold text-muted-foreground">{formatMoney(inEscrow, CUR)}</p>
              </div>
            </div>

            {/* Step 1 - amount */}
            <div className="mt-6 flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
                1
              </span>
              <span className="text-sm font-bold text-ink">{t('withdraw.amountToWithdraw')}</span>
            </div>
            <div
              className={cn(
                'mt-3 flex items-center gap-3 rounded-2xl border p-4',
                overBalance ? 'border-negative' : 'border-hairline bg-[#F8FBFF]',
              )}
            >
              <span className="text-[30px] font-extrabold text-muted-foreground">{currencySymbol(CUR)}</span>
              <input
                inputMode="numeric"
                value={amount ? amount.toLocaleString('en-US') : ''}
                onChange={(event) => setAmount(Number(event.target.value.replace(/[^\d]/g, '')) || 0)}
                className="min-w-0 flex-1 bg-transparent text-[30px] font-extrabold text-ink outline-none"
                aria-label={t('withdraw.amountToWithdraw')}
              />
              <button
                type="button"
                onClick={() => setAmount(available)}
                className="rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100"
              >
                {t('withdraw.max')}
              </button>
            </div>
            {overBalance ? (
              <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium text-negative">
                <AlertCircle className="size-4 shrink-0" />
                {t('withdraw.overBalance')}
              </p>
            ) : (
              <p className="mt-2.5 text-[12.5px] text-muted-foreground">
                {t('withdraw.availableBalanceAmount', { amount: formatMoney(available, CUR, 0) })}
              </p>
            )}

            {/* Step 2 - pay to */}
            <div className="mt-6 flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
                2
              </span>
              <span className="text-sm font-bold text-ink">{t('withdraw.payTo')}</span>
            </div>
            <div className="mt-3 space-y-3">
              {payoutMethods.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">{t('withdraw.subtitle')}</p>
              ) : null}
              {payoutMethods.map((option) => {
                const isSelected = selected?.id === option.id;
                const Icon = KIND_ICON[option.kind] ?? Landmark;
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
                        <Icon className="size-[18px]" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      {option.kind === 'momo' ? (
                        <>
                          <p className="text-[14px] font-bold text-ink">{option.detail}</p>
                          <p className="text-[12px] text-muted-foreground">
                            {arrivalDetail(option)}
                            {option.isDefault ? ` · ${t('withdraw.max')}` : ''}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-[14px] font-bold text-ink">{option.name}</p>
                          <p className="text-[12px] text-muted-foreground">
                            {option.detail} · {arrivalDetail(option)}
                            {option.isDefault ? ` · ${t('withdraw.max')}` : ''}
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
              <Link
                href="/settings/payouts/new"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-field py-3.5 text-sm font-semibold text-brand-600 transition hover:border-brand-border hover:bg-brand-50/40"
              >
                <Plus className="size-4" />
                {t('withdraw.addMethod')}
              </Link>
            </div>
          </div>

          {/* RIGHT - summary */}
          <div className="space-y-5">
            <div className="shadow-card rounded-2xl border border-hairline bg-surface p-6">
              <h2 className="text-sm font-bold text-ink">{t('withdraw.beforeConfirm')}</h2>
              <dl className="mt-4 space-y-2.5 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('withdraw.amount')}</dt>
                  <dd className="font-semibold text-ink">{formatMoney(amount, CUR)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('withdraw.payTo')}</dt>
                  <dd className="font-semibold text-ink">{selected ? selected.name : '-'}</dd>
                </div>
                {transferFee > 0 ? (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('withdraw.transferFee')}</dt>
                      <dd className="font-semibold text-ink">{formatMoney(transferFee, CUR)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('withdraw.debitedFromWallet')}</dt>
                      <dd className="font-semibold text-ink">{formatMoney(totalDebited, CUR)}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
              <div className="my-4 h-px bg-hairline" />
              <div className="flex items-end justify-between">
                <span className="text-sm font-bold text-ink">{t('withdraw.youReceive')}</span>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-ink">{formatMoney(youReceive, CUR)}</div>
                  <div className="text-[12px] text-muted-foreground">{selected ? selected.detail : ''}</div>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-warning-bg-soft px-3 py-2.5 text-[12.5px] font-medium text-warning-text">
                {t('withdraw.escrowSafeBody')}
              </div>
              <button
                type="button"
                onClick={confirmWithdraw}
                disabled={!canSubmit}
                className={cn(
                  'mt-4 h-12 w-full rounded-xl text-[15px] font-semibold transition',
                  canSubmit ? 'bg-primary shadow-brand text-white hover:opacity-95' : 'cursor-not-allowed bg-field text-white',
                )}
              >
                {t('withdraw.cta', { amount: formatMoney(amount, CUR) })}
              </button>
              <Link
                href="/wallet"
                className="mt-2 flex h-11 w-full items-center justify-center rounded-xl border border-hairline text-sm font-semibold text-ink transition hover:bg-muted"
              >
                {t('withdraw.cancel')}
              </Link>
            </div>

            <div className="shadow-card rounded-2xl border border-hairline bg-surface p-6">
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none">🔒</span>
                <div>
                  <h2 className="text-sm font-bold text-ink">{t('withdraw.escrowSafeTitle')}</h2>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {t('withdraw.escrowSafeBody')}
                  </p>
                </div>
              </div>
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
        <h1 className="text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('withdraw.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('withdraw.subtitle')}</p>
      </div>

      {/* Amount card */}
      <section className="shadow-card rounded-2xl border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12.5px] font-semibold text-muted-foreground">{t('withdraw.amountToWithdraw')}</p>
          <button
            type="button"
            onClick={() => setAmount(available)}
            className="text-[12px] font-semibold text-muted-foreground transition hover:text-brand-700"
          >
            {t('withdraw.availableBalanceAmount', { amount: formatMoney(available, CUR, 0) })}
          </button>
        </div>

        <div
          className={cn(
            'mt-2 flex items-center gap-3 border-b-[1.5px] pb-2 transition-colors',
            overBalance ? 'border-negative' : 'border-hairline',
          )}
        >
          <span className="text-2xl font-bold text-muted-foreground">{currencySymbol(CUR)}</span>
          <input
            inputMode="numeric"
            value={amount ? amount.toLocaleString('en-US') : ''}
            onChange={(event) => setAmount(Number(event.target.value.replace(/[^\d]/g, '')) || 0)}
            className="min-w-0 flex-1 bg-transparent text-[30px] font-extrabold text-ink outline-none"
            aria-label={t('withdraw.amountToWithdraw')}
          />
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-ink">{CUR}</span>
        </div>

        {overBalance ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium text-negative">
            <AlertCircle className="size-4 shrink-0" />
            {t('withdraw.overBalance')}
          </p>
        ) : null}
      </section>

      {/* Pay to */}
      <div>
        <p className="mb-2.5 text-sm font-bold text-ink">{t('withdraw.payTo')}</p>
        <div className="space-y-3">
          {payoutMethods.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">{t('withdraw.subtitle')}</p>
          ) : null}
          {payoutMethods.map((option) => {
            const isSelected = selected?.id === option.id;
            const Icon = KIND_ICON[option.kind] ?? Landmark;
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
                    <Icon className="size-[18px]" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {option.kind === 'momo' ? (
                    <>
                      <p className="text-[14px] font-bold text-ink">{option.detail}</p>
                      <p className="text-[12px] text-muted-foreground">{arrivalDetail(option)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[14px] font-bold text-ink">{option.name}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {option.detail} · {arrivalDetail(option)}
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
          <Link
            href="/settings/payouts/new"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-field py-3.5 text-sm font-semibold text-brand-600 transition hover:border-brand-border hover:bg-brand-50/40"
          >
            <Plus className="size-4" />
            {t('withdraw.addMethod')}
          </Link>
        </div>
      </div>

      {/* Breakdown */}
      <div className="rounded-2xl bg-[#F5F8FC] p-4">
        <dl className="space-y-2.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('withdraw.amount')}</dt>
            <dd className="font-semibold text-ink">{formatMoney(amount, CUR)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('withdraw.payTo')}</dt>
            <dd className="font-semibold text-ink">{selected ? selected.name : '-'}</dd>
          </div>
        </dl>
        <div className="my-3 h-px bg-hairline" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">{t('withdraw.youReceive')}</span>
          <span className="text-lg font-extrabold text-ink">{formatMoney(youReceive, CUR)}</span>
        </div>
      </div>

      {/* Actions */}
      <button
        type="button"
        onClick={confirmWithdraw}
        disabled={!canSubmit}
        className={cn(
          'h-12 w-full rounded-xl text-[15px] font-semibold transition',
          canSubmit ? 'bg-primary shadow-brand text-white hover:opacity-95' : 'cursor-not-allowed bg-field text-white',
        )}
      >
        {t('nav.withdraw')}
      </button>
      <Link
        href="/wallet"
        className="flex h-11 w-full items-center justify-center rounded-xl border border-hairline text-sm font-semibold text-ink transition hover:bg-muted"
      >
        {t('withdraw.cancel')}
      </Link>
      </div>
    </>
  );
}
