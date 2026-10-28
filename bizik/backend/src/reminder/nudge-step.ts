import { Contract, Milestone } from '@prisma/client';

import { resolveParties } from '../lib/contract-flow';

/**
 * Working out what a deal is waiting on, and whose move it is. Pure and
 * dependency-free so the rule can be reasoned about (and tested) on its own -
 * {@link NudgeService} does the messaging around it.
 */

/** What the deal is waiting on, and which side owes it. */
export type NudgeAction = 'accept' | 'fund' | 'deliver' | 'approve';

export interface PendingStep {
  action: NudgeAction;
  /** The user who owes this step; null when the invitee has no account yet. */
  owedBy: string | null;
  milestone?: Milestone;
}

type NudgeContract = Pick<
  Contract,
  'creatorId' | 'counterpartyId' | 'creatorIsPayer' | 'accepted' | 'status'
> & { milestones: Milestone[] };

/** Ordered by urgency: a submitted delivery outranks work further down the list. */
const OPEN_MILESTONE_ORDER: Milestone['status'][] = ['SUBMITTED', 'FUNDED', 'ACTIVE', 'PENDING'];

/**
 * The single next thing this deal is waiting on. Symmetric by construction: the
 * owed party is derived from who PAYS on this deal, so a seller chasing a buyer
 * and a buyer chasing a seller both resolve through the same rule.
 */
export function pendingStep(contract: NudgeContract): PendingStep | null {
  if (contract.status === 'CANCELLED' || contract.status === 'COMPLETED') return null;

  const { payerId, payeeId } = resolveParties(contract);

  if (!contract.accepted) {
    return { action: 'accept', owedBy: contract.counterpartyId };
  }
  if (contract.milestones.some((milestone) => milestone.status === 'DISPUTED')) {
    return null; // a mediator owns it now - nobody is nudged
  }

  for (const status of OPEN_MILESTONE_ORDER) {
    const milestone = contract.milestones.find((entry) => entry.status === status);
    if (!milestone) continue;
    if (status === 'SUBMITTED') return { action: 'approve', owedBy: payerId, milestone };
    if (status === 'FUNDED' || status === 'ACTIVE') {
      return { action: 'deliver', owedBy: payeeId, milestone };
    }
    return { action: 'fund', owedBy: payerId, milestone };
  }
  return null;
}

export const NUDGE_HEADINGS: Record<NudgeAction, string> = {
  accept: 'Reminder: a deal is waiting for you',
  fund: 'Reminder: escrow is waiting to be funded',
  deliver: 'Reminder: a delivery is expected',
  approve: 'Reminder: a delivery is waiting for your approval',
};

export function nudgeBody(
  action: NudgeAction,
  ctx: { actorName: string; dealTitle: string; milestoneTitle?: string; autoReleaseAt: Date | null },
): string {
  const deal = `“${ctx.dealTitle}”`;
  switch (action) {
    case 'accept':
      return `${ctx.actorName} is still waiting for you to accept the deal ${deal}. Nothing is charged until it is funded, and BiZik holds the money safely until the delivery is approved.`;
    case 'fund':
      return `${ctx.actorName} is waiting for you to fund ${deal}. Your money stays protected in escrow. It is only released once you approve the delivery.`;
    case 'deliver':
      return `${ctx.actorName} is waiting for your delivery on ${deal}${
        ctx.milestoneTitle ? ` (${ctx.milestoneTitle})` : ''
      }. The money is already held safely in escrow, so you'll be paid as soon as it is approved.`;
    case 'approve': {
      const auto = ctx.autoReleaseAt
        ? ` If you do nothing, it auto-releases on ${ctx.autoReleaseAt.toISOString().slice(0, 10)}.`
        : '';
      return `${ctx.actorName} is waiting for you to review${
        ctx.milestoneTitle ? ` “${ctx.milestoneTitle}”` : ''
      } on ${deal} and release the payment.${auto}`;
    }
  }
}
