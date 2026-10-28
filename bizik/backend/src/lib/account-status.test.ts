import { describe, expect, it } from 'vitest';

import { accountBlockedReason, canAccountAct } from './account-status';

describe('canAccountAct', () => {
  it('lets an active or brand-new account transact', () => {
    expect(canAccountAct('ACTIVE')).toBe(true);
    // PENDING is a signup that hasn't finished verifying - not a sanction.
    expect(canAccountAct('PENDING')).toBe(true);
  });

  it('stops an account an operator or AML decision has closed off', () => {
    expect(canAccountAct('FROZEN')).toBe(false);
    expect(canAccountAct('SUSPENDED')).toBe(false);
    expect(canAccountAct('CLOSED')).toBe(false);
  });
});

describe('accountBlockedReason', () => {
  it('explains every blocked state without leaking why internally', () => {
    for (const status of ['FROZEN', 'SUSPENDED', 'CLOSED'] as const) {
      const reason = accountBlockedReason(status);
      expect(reason).toBeTruthy();
      expect(reason).not.toMatch(/AML alert|sanction hit/i);
    }
  });

  it('has nothing to say about an account that can act', () => {
    expect(accountBlockedReason('ACTIVE')).toBeNull();
    expect(accountBlockedReason('PENDING')).toBeNull();
  });
});
