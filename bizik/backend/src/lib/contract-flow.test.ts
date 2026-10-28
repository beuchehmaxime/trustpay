import { Milestone } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { isLiveMilestone, recomputeContractStatus } from './contract-flow';

/** Only `status` matters to the flow helpers - build the minimum shape. */
const at = (...statuses: Milestone['status'][]) => statuses.map((status) => ({ status }));

describe('isLiveMilestone', () => {
  it('counts every milestone except a cancelled one', () => {
    expect(isLiveMilestone({ status: 'PENDING' })).toBe(true);
    expect(isLiveMilestone({ status: 'FUNDED' })).toBe(true);
    expect(isLiveMilestone({ status: 'RELEASED' })).toBe(true);
    expect(isLiveMilestone({ status: 'CANCELLED' })).toBe(false);
  });
});

describe('recomputeContractStatus', () => {
  it('stays INVITED until the counterparty accepts', () => {
    expect(recomputeContractStatus(at('PENDING'), false)).toBe('INVITED');
  });

  it('moves through the lifecycle as milestones progress', () => {
    expect(recomputeContractStatus(at('PENDING', 'PENDING'), true)).toBe('SIGNED');
    expect(recomputeContractStatus(at('FUNDED', 'PENDING'), true)).toBe('IN_PROGRESS');
    expect(recomputeContractStatus(at('SUBMITTED', 'PENDING'), true)).toBe('IN_REVIEW');
    expect(recomputeContractStatus(at('DISPUTED', 'FUNDED'), true)).toBe('DISPUTED');
    expect(recomputeContractStatus(at('RELEASED', 'RELEASED'), true)).toBe('COMPLETED');
  });

  it('ignores cancelled milestones when deriving the status', () => {
    // The cancelled line item must not hold the deal back from completing…
    expect(recomputeContractStatus(at('RELEASED', 'CANCELLED'), true)).toBe('COMPLETED');
    // …nor make an otherwise-untouched deal look like it is in progress.
    expect(recomputeContractStatus(at('PENDING', 'CANCELLED'), true)).toBe('SIGNED');
    expect(recomputeContractStatus(at('FUNDED', 'CANCELLED'), true)).toBe('IN_PROGRESS');
  });

  it('cancels the whole deal once every milestone is cancelled', () => {
    expect(recomputeContractStatus(at('CANCELLED'), true)).toBe('CANCELLED');
    expect(recomputeContractStatus(at('CANCELLED', 'CANCELLED'), true)).toBe('CANCELLED');
    // …even before the other party ever accepted it.
    expect(recomputeContractStatus(at('CANCELLED'), false)).toBe('CANCELLED');
  });

  it('treats a project with no milestones at all as unchanged', () => {
    expect(recomputeContractStatus([], true)).toBe('SIGNED');
  });
});
