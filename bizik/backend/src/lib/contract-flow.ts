import { Contract, ContractStatus, Milestone } from '@prisma/client';

/**
 * Per-project parties. There is no global client/freelancer role - for THIS
 * project one side pays (funds escrow / approves) and the other gets paid
 * (submits work). `creatorIsPayer` decides which is which.
 */
export function resolveParties(c: Pick<Contract, 'creatorId' | 'counterpartyId' | 'creatorIsPayer'>) {
  return {
    payerId: c.creatorIsPayer ? c.creatorId : c.counterpartyId,
    payeeId: c.creatorIsPayer ? c.counterpartyId : c.creatorId,
  };
}

/**
 * Milestone states that no longer count towards the deal - a cancelled
 * milestone is kept for history but is not part of the live agreement.
 */
export function isLiveMilestone(milestone: Pick<Milestone, 'status'>): boolean {
  return milestone.status !== 'CANCELLED';
}

/**
 * Derive the contract status from its milestones (single source of truth so the
 * lifecycle stays consistent after every escrow/work transition). Cancelled
 * milestones are ignored; when every milestone has been cancelled the whole
 * deal is cancelled with them.
 */
export function recomputeContractStatus(
  milestones: Pick<Milestone, 'status'>[],
  accepted: boolean,
): ContractStatus {
  const live = milestones.filter(isLiveMilestone);
  if (milestones.length > 0 && live.length === 0) return 'CANCELLED';
  if (!accepted) return 'INVITED';
  if (live.length > 0 && live.every((m) => m.status === 'RELEASED')) {
    return 'COMPLETED';
  }
  if (live.some((m) => m.status === 'DISPUTED')) return 'DISPUTED';
  if (live.some((m) => m.status === 'SUBMITTED')) return 'IN_REVIEW';
  if (live.some((m) => m.status === 'FUNDED' || m.status === 'ACTIVE')) {
    return 'IN_PROGRESS';
  }
  return 'SIGNED';
}
