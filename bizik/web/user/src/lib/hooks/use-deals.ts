import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { contractsApi, type Contract, type ContractStatus, type ContractsResponse } from '@/lib/api/contracts.api';
import { formatMoney } from '@/lib/format';
import type { AvatarTone, DealListItem, DealStatus, ProgressTone } from '@/lib/demo/deals';

/** Shared raw contracts query - reused by the deals list and the dashboard. */
export function useContractsQuery() {
  return useQuery({
    queryKey: ['contracts'],
    queryFn: contractsApi.list,
  });
}

// ---- Mapping helpers -------------------------------------------------------

const STATUS_MAP: Record<ContractStatus, DealStatus> = {
  Pending: 'pending',
  Draft: 'pending',
  'Awaiting funding': 'awaiting_funding',
  'In progress': 'in_progress',
  'In review': 'in_review',
  Disputed: 'disputed',
  Completed: 'completed',
  Cancelled: 'cancelled',
};

const AVATAR_TONES: AvatarTone[] = ['brand', 'warning', 'positive', 'neutral'];

/** Deterministic avatar tone from a name, so a party always looks the same. */
function toneFor(name: string): AvatarTone {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

/** Initials from a full name, e.g. "Kwame Mensah" -> "KM". */
function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function progressToneFor(status: DealStatus): ProgressTone {
  if (status === 'awaiting_funding') return 'warning';
  if (status === 'in_review') return 'cyan';
  return 'brand';
}

/**
 * The primary amount shown to the viewer is always in THEIR OWN currency. This
 * returns the original deal-currency figure as a small "≈" reference, shown only
 * when the two currencies differ.
 */
function originalCurrencyRef(contract: Contract): string | undefined {
  const { fxToViewer, viewerCurrency, amount, currency } = contract;
  if (!fxToViewer || !viewerCurrency || fxToViewer === 1 || viewerCurrency === currency) {
    return undefined;
  }
  return `≈ ${formatMoney(amount, currency, 2)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format an ISO date as "22 Aug" for the awaiting-funding due line. */
function shortDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** Map a backend Contract onto the existing demo `DealListItem` shape. */
function toDealListItem(contract: Contract, origin: 'created' | 'invited'): DealListItem {
  const status = STATUS_MAP[contract.status] ?? 'pending';
  const isPayer = contract.viewerRole === 'client';
  // A pending project you were invited to (didn't create) is an open invite.
  const isInvite = contract.status === 'Pending' && !contract.isCreator && origin === 'invited';

  const relKey: DealListItem['relKey'] = isInvite ? 'invitedBy' : isPayer ? 'to' : 'from';

  // Next-step hint (drives the desktop table's "Next step" column).
  let nextStepKey: string | undefined;
  let nextStepParams: Record<string, string> | undefined;
  let nextStepMuted: boolean | undefined;
  if (!isInvite) {
    if (status === 'awaiting_funding' && isPayer) {
      nextStepKey = 'deals.next.fundEscrow';
    } else {
      const submittedIndex = contract.milestones.findIndex((milestone) => milestone.status === 'Submitted');
      if (submittedIndex >= 0 && isPayer) {
        nextStepKey = 'deals.next.approveMilestone';
        nextStepParams = { n: String(submittedIndex + 1) };
      } else if (submittedIndex >= 0 && !isPayer) {
        nextStepKey = 'deals.next.waitingApproval';
        nextStepMuted = true;
      }
    }
  }

  const payeeName = contract.freelancerName?.split(' ')[0];
  const due = status === 'awaiting_funding' ? shortDate(contract.milestones[0]?.dueDate) : undefined;

  // Show the amount in the viewer's own home currency (backend `fxToViewer` is 1
  // when it already matches the deal currency).
  const fxToViewer = contract.fxToViewer ?? 1;
  const displayCurrency = contract.viewerCurrency ?? contract.currency;

  return {
    id: contract.id,
    title: contract.title,
    origin,
    relKey,
    partyName: contract.counterparty,
    partyMeta: contract.counterpartyCountry || undefined,
    initials: initialsOf(contract.counterparty),
    avatarTone: toneFor(contract.counterparty),
    escrowValue: contract.amount * fxToViewer,
    escrowCurrency: displayCurrency,
    approx: originalCurrencyRef(contract),
    done: contract.milestonesDone,
    total: contract.milestonesTotal,
    progressTone: progressToneFor(status),
    status,
    nextStepKey,
    nextStepParams,
    nextStepMuted,
    isInvite: isInvite || undefined,
    payeeName,
    due,
  };
}

export interface DealsSummary {
  currency: string;
  active: number;
  heldInEscrow: number;
  invited: number;
}

function buildSummary(deals: DealListItem[], contracts: Contract[]): DealsSummary {
  const currency = contracts.find((contract) => contract.viewerCurrency)?.viewerCurrency
    ?? contracts[0]?.currency
    ?? 'USD';
  const heldInEscrow = contracts.reduce(
    (total, contract) => total + (contract.escrow?.held ?? 0) * (contract.fxToViewer ?? 1),
    0,
  );
  return {
    currency,
    active: deals.filter((deal) => ['in_progress', 'awaiting_funding', 'in_review'].includes(deal.status)).length,
    heldInEscrow,
    invited: deals.filter((deal) => deal.isInvite).length,
  };
}

/** Map a raw contracts response into the demo `deals` + `dealsSummary` shapes. */
export function mapContractsToDeals(data?: ContractsResponse): { deals: DealListItem[]; dealsSummary: DealsSummary } {
  const mine = (data?.mine ?? []).map((contract) => toDealListItem(contract, 'created'));
  const invited = (data?.invited ?? []).map((contract) => toDealListItem(contract, 'invited'));
  const deals = [...mine, ...invited];
  const allContracts = [...(data?.mine ?? []), ...(data?.invited ?? [])];
  return { deals, dealsSummary: buildSummary(deals, allContracts) };
}

/** Live replacement for the static `deals` / `dealsSummary` demo imports. */
export function useDeals() {
  const query = useContractsQuery();
  const mapped = useMemo(() => mapContractsToDeals(query.data), [query.data]);
  return { ...mapped, isLoading: query.isLoading };
}
