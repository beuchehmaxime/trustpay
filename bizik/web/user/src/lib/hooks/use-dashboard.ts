import { useMemo } from 'react';

import type { Contract } from '@/lib/api/contracts.api';
import { formatMoney } from '@/lib/format';
import type { ActiveDeal, AttentionCard } from '@/lib/demo/dashboard';
import { useContractsQuery } from './use-deals';
import { useWallet } from './use-wallet';

/** An attention card plus the deep-link its CTA navigates to. */
export interface DashboardAttentionCard extends AttentionCard {
  href: string;
}

/** One slice of the "Escrow by deal" donut, derived from live escrow holdings. */
export interface EscrowSlice {
  label: string;
  value: number;
}

/** A deal still in flight (something to track or act on). */
function isActive(contract: Contract): boolean {
  return contract.status !== 'Completed' && contract.rawStatus !== 'CANCELLED';
}

const AVATAR_TONES: NonNullable<ActiveDeal['avatarTone']>[] = ['brand', 'warning', 'positive', 'neutral'];

function toneFor(name: string): NonNullable<ActiveDeal['avatarTone']> {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

/**
 * Amounts are shown in the viewer's own currency; this returns the original
 * deal-currency figure as a small "≈" reference, only when the two differ.
 */
function originalCurrencyRef(contract: Contract): string | undefined {
  const { fxToViewer, viewerCurrency, amount, currency } = contract;
  if (!fxToViewer || !viewerCurrency || fxToViewer === 1 || viewerCurrency === currency) {
    return undefined;
  }
  return `≈ ${formatMoney(amount, currency, 2)}`;
}

/** Map a backend Contract onto the dashboard's `ActiveDeal` card shape. */
function toActiveDeal(contract: Contract): ActiveDeal {
  const youGetPaid = contract.viewerRole === 'freelancer';
  let detailKey: string;
  let detailParams: Record<string, string | number> | undefined;
  if (youGetPaid) {
    detailKey = 'dashboard.youGetPaid';
  } else if (contract.milestonesTotal <= 1) {
    detailKey = 'deals.meta.singlePayment';
  } else {
    detailKey = 'dashboard.milestonesShort';
    detailParams = { done: contract.milestonesDone, total: contract.milestonesTotal };
  }
  const fxToViewer = contract.fxToViewer ?? 1;
  const displayCurrency = contract.viewerCurrency ?? contract.currency;
  return {
    id: contract.id,
    title: contract.title,
    counterparty: contract.counterparty,
    amount: contract.amount * fxToViewer,
    currency: displayCurrency,
    equivalent: originalCurrencyRef(contract),
    statusLabel: contract.status,
    nextStep: '',
    youGetPaid: youGetPaid || undefined,
    avatarTone: toneFor(contract.counterparty),
    relation: contract.viewerRole === 'client' ? 'to' : 'from',
    detailKey,
    detailParams,
  };
}

/** Derive the "Needs your attention" cards from real pending actions. */
function toAttentionCards(contracts: Contract[]): DashboardAttentionCard[] {
  const cards: DashboardAttentionCard[] = [];
  for (const contract of contracts) {
    const dealHref = `/deals/${contract.id}`;
    // Show every figure in the viewer's own currency.
    const fxToViewer = contract.fxToViewer ?? 1;
    const displayCurrency = contract.viewerCurrency ?? contract.currency;
    if (contract.status === 'Awaiting funding' && contract.viewerRole === 'client') {
      cards.push({
        id: `fund-${contract.id}`,
        statusLabel: 'Awaiting funding',
        tone: 'warning',
        title: contract.title,
        meta: `to ${contract.counterparty} · ${formatMoney(contract.amount * fxToViewer, displayCurrency, 2)}`,
        nextStep: `Next step: fund the escrow so ${contract.counterparty} can start.`,
        cta: 'Fund escrow',
        ctaTone: 'brand',
        href: dealHref,
      });
    }
    const submitted = contract.milestones.find((milestone) => milestone.status === 'Submitted');
    if (submitted && contract.viewerRole === 'client') {
      cards.push({
        id: `approve-${contract.id}`,
        statusLabel: 'Submitted',
        tone: 'positive',
        title: contract.title,
        meta: `${contract.counterparty} · ${formatMoney(submitted.amount * fxToViewer, displayCurrency, 2)}`,
        nextStep: `Next step: review the delivery, then release ${formatMoney(submitted.amount * fxToViewer, displayCurrency, 0)}.`,
        cta: 'Approve & release',
        ctaTone: 'positive',
        href: dealHref,
      });
    }
    if (contract.status === 'Disputed') {
      cards.push({
        id: `dispute-${contract.id}`,
        statusLabel: 'Under review',
        tone: 'negative',
        title: contract.title,
        meta: contract.counterparty,
        nextStep: 'Next step: add your evidence for the mediator.',
        cta: 'Add evidence',
        ctaTone: 'danger',
        href: dealHref,
      });
    }
  }
  return cards.slice(0, 6);
}

/**
 * "Escrow by deal" donut slices from real escrow holdings - each project with
 * funds still held, normalised to the viewer's currency so slices compare.
 */
function toEscrowByDeal(contracts: Contract[]): EscrowSlice[] {
  return contracts
    .map((contract) => ({
      label: contract.title,
      value: (contract.escrow?.held ?? 0) * (contract.fxToViewer ?? 1),
    }))
    .filter((slice) => slice.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);
}

/**
 * Live dashboard data. Combines the wallet overview (balances) with the
 * contracts list (KPIs, active-deal cards, attention cards), mapped onto the
 * existing `persona` / `ActiveDeal` / `AttentionCard` demo shapes. The
 * "Escrow by deal" donut is derived from each contract's live `escrow.held`.
 */
export function useDashboard() {
  const wallet = useWallet();
  const contractsQuery = useContractsQuery();

  return useMemo(() => {
    const data = contractsQuery.data;
    const all: Contract[] = [...(data?.mine ?? []), ...(data?.invited ?? [])];
    const attentionCards = toAttentionCards(all);
    const active = all.filter(isActive);

    const persona = {
      homeCurrency: wallet.homeCurrency,
      walletBalance: wallet.walletBalance,
      walletBalanceUsd: wallet.walletBalanceUsd,
      inEscrow: wallet.inEscrow,
      inEscrowDeals: all.filter((contract) => (contract.escrow?.held ?? 0) > 0).length,
      dealsDone: all.filter((contract) => contract.status === 'Completed').length,
      activeDeals: active.length,
      dealsNeedingAction: attentionCards.length,
      openDisputes: all.filter((contract) => contract.status === 'Disputed').length,
    };

    return {
      persona,
      activeDeals: active.slice(0, 5).map(toActiveDeal),
      attentionCards,
      escrowByDeal: toEscrowByDeal(all),
      isLoading: wallet.isLoading || contractsQuery.isLoading,
      isError: wallet.isError || contractsQuery.isError,
      refetch: () => {
        wallet.refetch();
        contractsQuery.refetch();
      },
    };
  }, [wallet, contractsQuery.data, contractsQuery.isLoading, contractsQuery.isError, contractsQuery.refetch]);
}
