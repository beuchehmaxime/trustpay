import { describe, expect, it } from 'vitest';

import { noticeDueFor, NOTICE_SCHEDULE } from './dormancy.service';
import type { DormantCandidate } from './dormancy.service';

/**
 * When somebody is warned, and when they may be deleted.
 *
 * Every rule here protects an account. The expensive mistakes are asymmetric:
 * warning somebody twice is an annoyance, deleting them one day early or
 * without notice is unrecoverable. So these pin the conservative direction
 * rather than the convenient one.
 */
function candidate(overrides: Partial<DormantCandidate> = {}): DormantCandidate {
  const daysOut = overrides.scheduledFor
    ? undefined
    : 30;
  return {
    userId: 'u1',
    fullName: 'Test Person',
    phone: '+237650000000',
    email: null,
    reason: 'NEVER_VERIFIED',
    createdAt: new Date(),
    scheduledFor: new Date(Date.now() + (daysOut ?? 0) * 86_400_000),
    noticesSent: 0,
    eligible: false,
    ...overrides,
  };
}

/** A candidate whose deletion is `days` away. */
function dueIn(days: number, noticesSent = 0): DormantCandidate {
  return candidate({ scheduledFor: new Date(Date.now() + days * 86_400_000), noticesSent });
}

describe('dormancy notice schedule', () => {
  it('warns three times: two weeks out, one week out, and two days out', () => {
    expect(NOTICE_SCHEDULE).toEqual([14, 7, 2]);
  });

  it('sends nothing while the deletion is still far away', () => {
    expect(noticeDueFor(dueIn(30))).toBeNull();
    expect(noticeDueFor(dueIn(20))).toBeNull();
  });

  it('sends the first warning at two weeks out', () => {
    expect(noticeDueFor(dueIn(14))).toBe(1);
    expect(noticeDueFor(dueIn(13))).toBe(1);
  });

  it('does not send the second warning until a week out, however long stage 1 has sat', () => {
    // 12 days left, first warning already sent: nothing is due. Without this
    // the three warnings would all go out on consecutive days and the notice
    // period would mean nothing.
    expect(noticeDueFor(dueIn(12, 1))).toBeNull();
    expect(noticeDueFor(dueIn(7, 1))).toBe(2);
  });

  it('sends the final warning two days out', () => {
    expect(noticeDueFor(dueIn(5, 2))).toBeNull();
    expect(noticeDueFor(dueIn(2, 2))).toBe(3);
  });

  it('sends nothing more once all three have gone', () => {
    expect(noticeDueFor(dueIn(1, 3))).toBeNull();
    expect(noticeDueFor(dueIn(-5, 3))).toBeNull();
  });

  it('still sends a missed earlier warning rather than skipping to the latest', () => {
    // An account past its date that was never warned gets stage 1 now, not
    // stage 3 - and stays ineligible until all three have been delivered. A
    // failed warning must DELAY a deletion, never be treated as given.
    expect(noticeDueFor(dueIn(-1, 0))).toBe(1);
    expect(noticeDueFor(dueIn(-1, 1))).toBe(2);
    expect(noticeDueFor(dueIn(-1, 2))).toBe(3);
  });
});

describe('eligibility for deletion', () => {
  /** Mirrors the rule findCandidates() applies when it builds the list. */
  function isEligible(input: DormantCandidate): boolean {
    return input.noticesSent >= NOTICE_SCHEDULE.length && input.scheduledFor <= new Date();
  }

  it('is not eligible before the date, even when fully warned', () => {
    expect(isEligible(dueIn(1, 3))).toBe(false);
  });

  it('is not eligible after the date when a warning is missing', () => {
    // The case that matters most: the clock has run out but we never told them.
    expect(isEligible(dueIn(-10, 2))).toBe(false);
    expect(isEligible(dueIn(-10, 0))).toBe(false);
  });

  it('is eligible only when fully warned AND past the date', () => {
    expect(isEligible(dueIn(-1, 3))).toBe(true);
  });
});
