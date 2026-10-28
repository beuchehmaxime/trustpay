import { Milestone } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { pendingStep } from './nudge-step';

const BUYER = 'user-buyer';
const SELLER = 'user-seller';

/** A milestone with only the fields the rule reads. */
const milestone = (status: Milestone['status'], title = 'Laptop') =>
  ({ id: `ms-${status}`, title, status }) as Milestone;

/**
 * `creatorIsPayer` decides which side pays, so build both shapes: a deal the
 * BUYER created (creator pays) and one the SELLER created (counterparty pays).
 * The pending step must come out identical either way.
 */
const dealCreatedByBuyer = (statuses: Milestone['status'][], accepted = true) => ({
  creatorId: BUYER,
  counterpartyId: SELLER,
  creatorIsPayer: true,
  accepted,
  status: 'SIGNED' as const,
  milestones: statuses.map((status) => milestone(status)),
});

const dealCreatedBySeller = (statuses: Milestone['status'][], accepted = true) => ({
  creatorId: SELLER,
  counterpartyId: BUYER,
  creatorIsPayer: false,
  accepted,
  status: 'SIGNED' as const,
  milestones: statuses.map((status) => milestone(status)),
});

describe('pendingStep - whose move is it', () => {
  it('asks the BUYER to fund an accepted deal, whoever created it', () => {
    // This is the case from the Laptop deal: the seller wants to chase the buyer.
    expect(pendingStep(dealCreatedBySeller(['PENDING']))).toMatchObject({
      action: 'fund',
      owedBy: BUYER,
    });
    expect(pendingStep(dealCreatedByBuyer(['PENDING']))).toMatchObject({
      action: 'fund',
      owedBy: BUYER,
    });
  });

  it('asks the SELLER to deliver once escrow is funded, whoever created it', () => {
    for (const status of ['FUNDED', 'ACTIVE'] as const) {
      expect(pendingStep(dealCreatedBySeller([status]))).toMatchObject({
        action: 'deliver',
        owedBy: SELLER,
      });
      expect(pendingStep(dealCreatedByBuyer([status]))).toMatchObject({
        action: 'deliver',
        owedBy: SELLER,
      });
    }
  });

  it('asks the BUYER to approve a submitted delivery', () => {
    expect(pendingStep(dealCreatedBySeller(['SUBMITTED']))).toMatchObject({
      action: 'approve',
      owedBy: BUYER,
    });
  });

  it('asks the INVITEE to accept a deal that is still pending', () => {
    expect(pendingStep(dealCreatedBySeller(['PENDING'], false))).toMatchObject({
      action: 'accept',
      owedBy: BUYER,
    });
    expect(pendingStep(dealCreatedByBuyer(['PENDING'], false))).toMatchObject({
      action: 'accept',
      owedBy: SELLER,
    });
  });

  it('picks the most urgent step when milestones are at different stages', () => {
    // A delivery awaiting approval outranks later work that is not funded yet.
    expect(pendingStep(dealCreatedBySeller(['PENDING', 'SUBMITTED']))).toMatchObject({
      action: 'approve',
      owedBy: BUYER,
    });
    expect(pendingStep(dealCreatedBySeller(['RELEASED', 'FUNDED']))).toMatchObject({
      action: 'deliver',
      owedBy: SELLER,
    });
  });

  it('nudges nobody once a mediator or the end of the deal owns it', () => {
    expect(pendingStep(dealCreatedBySeller(['DISPUTED', 'PENDING']))).toBeNull();
    expect(pendingStep(dealCreatedBySeller(['RELEASED']))).toBeNull();
    expect(pendingStep({ ...dealCreatedBySeller(['PENDING']), status: 'CANCELLED' })).toBeNull();
    expect(pendingStep({ ...dealCreatedBySeller(['PENDING']), status: 'COMPLETED' })).toBeNull();
    // A cancelled milestone is history - it never owes anyone anything.
    expect(pendingStep(dealCreatedBySeller(['CANCELLED']))).toBeNull();
  });
});
