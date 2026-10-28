'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
  ShieldCheck,
  Smartphone,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { normaliseError } from '@/lib/api/client';
import type { ContractMilestone } from '@/lib/api/contracts.api';
import type { PayoutKind, PayoutMethod } from '@/lib/api/wallet.api';
import { useContract, useFundFromNumber, useFundMilestone } from '@/lib/hooks/use-contract';
import { usePayoutMethods } from '@/lib/hooks/use-payouts';
import { useWallet } from '@/lib/hooks/use-wallet';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Round to 2 decimals (money-safe). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Icon per saved-method category (momo=phone, bank=building, payoneer=card). */
const KIND_ICON: Record<PayoutKind, LucideIcon> = {
  momo: Smartphone,
  bank: Landmark,
  payoneer: CreditCard,
};

const KIND_TILE: Record<PayoutKind, string> = {
  momo: 'bg-warning-bg text-warning-text',
  bank: 'bg-brand-50 text-brand-600',
  payoneer: 'bg-cyan-bg text-cyan-text',
};

/** 'wallet' or a saved payout-method id. */
type Selection = 'wallet' | string;

export default function FundEscrowPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-brand-500" />
        </div>
      }
    >
      <FundEscrowFlow />
    </Suspense>
  );
}

function FundEscrowFlow() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();

  const contractId = params.id;
  const requestedMilestoneId = searchParams.get('milestone');

  const { data: contract, isLoading, isError } = useContract(contractId);
  const { data: payoutMethods } = usePayoutMethods();
  const { overview, homeCurrency, walletBalance } = useWallet();
  const fundMilestone = useFundMilestone();
  const fundFromNumber = useFundFromNumber();
  // Set when the money is being collected from a phone instead of the wallet:
  // nothing is funded until the payer approves the prompt on that handset.
  const [awaitingPrompt, setAwaitingPrompt] = useState(false);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [funded, setFunded] = useState(false);

  // Resolve the milestone to fund: the one named in the query string, else the
  // first PENDING milestone (covers simple, single-milestone deals).
  const milestone: ContractMilestone | undefined = (() => {
    if (!contract) return undefined;
    if (requestedMilestoneId) {
      const match = contract.milestones.find((entry) => entry.id === requestedMilestoneId);
      if (match) return match;
    }
    return contract.milestones.find(
      (entry) => (entry.rawStatus ?? entry.status.toUpperCase()) === 'PENDING',
    );
  })();

  // Auto-redirect back to the funded deal once the success screen shows.
  useEffect(() => {
    if (!funded) return;
    const timer = window.setTimeout(() => router.replace(`/deals/${contractId}`), 2000);
    return () => window.clearTimeout(timer);
  }, [funded, contractId, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (isError || !contract || !milestone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-bold text-ink">{t('fundFlow.title')}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{t('fundFlow.notFound')}</p>
        <Link
          href={`/deals/${contractId}`}
          className="mt-3 text-[13px] font-semibold text-brand-700 hover:underline"
        >
          ← {t('deals.detailTitle')}
        </Link>
      </div>
    );
  }

  // Only the paying party funds escrow. The server enforces this; refusing here
  // stops the payee reaching a payment form (deep link, back button) that could
  // only ever fail on submit.
  if (contract.viewerRole !== 'client') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-bold text-ink">{t('fundFlow.payeeTitle')}</p>
        <p className="mt-1 max-w-[380px] text-[13px] text-muted-foreground">
          {t('fundFlow.payeeMessage', { name: contract.clientName })}
        </p>
        <Link
          href={`/deals/${contractId}`}
          className="mt-3 text-[13px] font-semibold text-brand-700 hover:underline"
        >
          ← {t('deals.detailTitle')}
        </Link>
      </div>
    );
  }

  // Everything is shown and charged in the payer's OWN account currency; the
  // backend converts to the deal currency for escrow. The viewer here IS the
  // payer, so use their viewer currency + FX multiplier from the contract.
  const payCurrency = contract.viewerCurrency ?? contract.currency;
  const fxToViewer = contract.fxToViewer ?? 1;
  const amount = round2(milestone.amount * fxToViewer);
  const fee = round2(amount * (contract.fees?.clientServicePct ?? 0.025));
  const total = round2(amount + fee);

  // The payer funds from their home-currency wallet.
  const homeWallet = overview?.wallets?.find((entry) => entry.currency === payCurrency);
  const walletHomeBalance = homeWallet
    ? homeWallet.balance
    : homeCurrency === payCurrency
      ? walletBalance
      : 0;
  const walletCovers = walletHomeBalance >= total;

  const methods = payoutMethods ?? [];
  const hasNoAlternative = methods.length === 0 && !walletCovers;

  const canConfirm = selection !== null && !fundMilestone.isPending && !fundFromNumber.isPending;

  const confirmFund = async () => {
    if (selection === null) return;
    try {
      if (selection === 'wallet') {
        // Funded straight from the balance - escrow holds it immediately.
        await fundMilestone.mutateAsync({ milestoneId: milestone.id });
        setFunded(true);
        return;
      }
      // Charged to their Mobile Money: the provider prompts that phone, and
      // escrow is funded only once the payment actually confirms.
      await fundFromNumber.mutateAsync({ milestoneId: milestone.id, payoutMethodId: selection });
      setAwaitingPrompt(true);
    } catch (error) {
      toast.error(normaliseError(error).message);
    }
  };

  if (awaitingPrompt) {
    return (
      <div className="mx-auto flex w-full max-w-[520px] flex-col items-center py-16 text-center">
        <Smartphone className="size-14 text-brand-600" />
        <h1 className="mt-5 text-xl font-extrabold text-ink">{t('fundFlow.promptTitle')}</h1>
        <p className="mt-2 max-w-[400px] text-[13.5px] leading-relaxed text-muted-foreground">
          {t('fundFlow.promptBody', { amount: formatMoney(total, payCurrency) })}
        </p>
        <p className="mt-3 max-w-[400px] text-[12px] text-subtle">{t('fundFlow.promptPinWarning')}</p>
        <Link
          href={`/deals/${contractId}`}
          className="bg-primary shadow-brand mt-6 flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold text-white transition hover:opacity-95"
        >
          {t('deals.detailTitle')}
        </Link>
      </div>
    );
  }

  if (funded) {
    return <FundSuccess amount={total} currency={payCurrency} contractId={contractId} router={router} />;
  }

  return (
    <div className="mx-auto w-full max-w-[620px] space-y-5 md:space-y-6">
      {/* Back link */}
      <Link
        href={`/deals/${contractId}`}
        className="flex w-fit items-center gap-1.5 text-[14px] font-semibold text-brand-700"
      >
        <ArrowLeft className="size-4" />
        {t('deals.detailTitle')}
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('fundFlow.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('fundFlow.subtitle')}</p>
        <p className="mt-3 text-[13px] font-semibold text-ink">
          {contract.title}
          <span className="text-muted-foreground"> · {milestone.title}</span>
        </p>
      </div>

      {/* Fee breakdown */}
      <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
        <dl className="space-y-2.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('deposit.amount')}</dt>
            <dd className="font-semibold text-ink">{formatMoney(amount, payCurrency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('deals.detail.bizikFee')}</dt>
            <dd className="font-semibold text-ink">{formatMoney(fee, payCurrency)}</dd>
          </div>
        </dl>
        <div className="my-4 h-px bg-hairline" />
        <div className="flex items-end justify-between">
          <span className="text-sm font-bold text-ink">{t('deposit.totalCharged')}</span>
          <span className="text-xl font-extrabold tracking-[-0.4px] text-ink">
            {formatMoney(total, payCurrency)}
          </span>
        </div>
      </section>

      {/* Payment sources */}
      <div>
        <p className="mb-2.5 text-sm font-bold text-ink">{t('fundFlow.choosePayment')}</p>
        <div className="space-y-3">
          {/* Wallet */}
          <SourceRow
            selected={selection === 'wallet'}
            onSelect={() => setSelection('wallet')}
            icon={Wallet}
            tile="bg-brand-50 text-brand-600"
            name={t('fundFlow.walletName')}
            detail={t('fundFlow.walletBalance', { amount: formatMoney(walletHomeBalance, payCurrency) })}
            hint={walletCovers ? undefined : t('fundFlow.insufficient')}
            charge={t('fundFlow.charged', { amount: formatMoney(total, payCurrency) })}
          />

          {/* Saved payout methods */}
          {methods.map((method) => {
            const kind = (KIND_ICON[method.kind] ? method.kind : 'bank') as PayoutKind;
            return (
              <SourceRow
                key={method.id}
                selected={selection === method.id}
                onSelect={() => setSelection(method.id)}
                icon={KIND_ICON[kind]}
                tile={KIND_TILE[kind]}
                name={method.name}
                detail={method.detail}
                charge={t('fundFlow.charged', { amount: formatMoney(total, payCurrency) })}
              />
            );
          })}
        </div>

        {/* No usable source → point to add-method */}
        {hasNoAlternative ? (
          <Link
            href="/settings/payouts/new"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-brand-border bg-surface py-4 text-[14px] font-semibold text-brand-600 transition hover:bg-brand-50/40"
          >
            <Plus className="size-4.5" />
            {t('fundFlow.addMethod')}
          </Link>
        ) : null}
      </div>

      {/* Escrow reassurance */}
      <p className="flex items-center gap-2 rounded-xl bg-positive-bg px-3 py-2.5 text-[12.5px] font-medium text-positive-text">
        <ShieldCheck className="size-4 shrink-0" />
        {t('deals.detail.protectedByEscrow')}
      </p>

      {/* Confirm */}
      <button
        type="button"
        onClick={confirmFund}
        disabled={!canConfirm}
        className="bg-primary shadow-brand flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {fundMilestone.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          t('fundFlow.confirmCta', { total: formatMoney(total, payCurrency) })
        )}
      </button>
      {selection === null ? (
        <p className="text-center text-[12.5px] text-muted-foreground">{t('fundFlow.selectSource')}</p>
      ) : null}
    </div>
  );
}

/** A single selectable payment-source row (wallet or a saved method). */
function SourceRow({
  selected,
  onSelect,
  icon: Icon,
  tile,
  name,
  detail,
  hint,
  charge,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: LucideIcon;
  tile: string;
  name: string;
  detail: string;
  hint?: string;
  charge: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'shadow-card flex w-full items-start gap-3 rounded-2xl border-[1.5px] p-4 text-left transition',
        selected ? 'border-brand-500 bg-brand-50/40' : 'border-hairline bg-surface hover:border-brand-border',
      )}
    >
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', tile)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[14.5px] font-bold text-ink">{name}</p>
          <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">{charge}</span>
        </div>
        <p className="truncate text-[12.5px] text-muted-foreground">{detail}</p>
        {hint ? <p className="mt-1 text-[12px] font-medium text-warning-text">{hint}</p> : null}
      </div>
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-field',
        )}
      >
        {selected ? <Check className="size-3.5" /> : null}
      </span>
    </button>
  );
}

/** Success screen: big check, funded amount, escrow reassurance, auto-redirect. */
function FundSuccess({
  amount,
  currency,
  contractId,
  router,
}: {
  amount: number;
  currency: string;
  contractId: string;
  router: ReturnType<typeof useRouter>;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center py-16 text-center">
      <span className="flex size-20 items-center justify-center rounded-full bg-positive-bg text-positive-text">
        <CheckCircle2 className="size-11" strokeWidth={2} />
      </span>
      <h1 className="mt-6 text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('fundFlow.successTitle')}</h1>
      <p className="mt-2 text-[28px] font-extrabold tracking-[-0.6px] text-ink">
        {formatMoney(amount, currency)}
      </p>
      <p className="mt-3 flex items-center gap-2 rounded-xl bg-positive-bg px-3.5 py-2.5 text-[12.5px] font-medium text-positive-text">
        <ShieldCheck className="size-4 shrink-0" />
        {t('fundFlow.successReassure')}
      </p>
      <button
        type="button"
        onClick={() => router.replace(`/deals/${contractId}`)}
        className="bg-primary shadow-brand mt-6 h-12 w-full rounded-xl text-[15px] font-semibold text-white transition hover:opacity-95"
      >
        {t('fundFlow.backToDeal')}
      </button>
      <p className="mt-3 text-[12.5px] text-muted-foreground">{t('fundFlow.redirecting')}</p>
    </div>
  );
}
