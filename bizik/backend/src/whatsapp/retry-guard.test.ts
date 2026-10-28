import { describe, expect, it } from 'vitest';

import { actionKey, asksToRetry, shouldSuppressRepeat } from './retry-guard';

const FUND = { tool: 'fund_milestone', args: { milestone_id: 'ms-1', momo_number: '+237670000000' } };

const failedJustNow = {
  tool: 'fund_milestone',
  argsKey: actionKey(FUND),
  at: Date.now(),
  message: 'Mobile Money payments are temporarily unavailable on BiZik.',
};

describe('actionKey', () => {
  it('is stable regardless of argument order', () => {
    expect(actionKey({ tool: 'fund_milestone', args: { a: '1', b: '2' } })).toBe(
      actionKey({ tool: 'fund_milestone', args: { b: '2', a: '1' } }),
    );
  });

  it('separates different targets and different tools', () => {
    expect(actionKey(FUND)).not.toBe(
      actionKey({ tool: 'fund_milestone', args: { ...FUND.args, milestone_id: 'ms-2' } }),
    );
    expect(actionKey(FUND)).not.toBe(actionKey({ tool: 'withdraw', args: FUND.args }));
  });
});

describe('shouldSuppressRepeat', () => {
  it('holds back the same payment while the user reacts to its failure', () => {
    // The exact sequence from the report: a payment fails, the user says why,
    // and the assistant offers the identical payment again.
    expect(shouldSuppressRepeat(FUND, failedJustNow, 'My payment API is down')).toBe(true);
    expect(shouldSuppressRepeat(FUND, failedJustNow, "that didn't work")).toBe(true);
  });

  it('lets it through when the user actually asks to retry', () => {
    expect(shouldSuppressRepeat(FUND, failedJustNow, 'try again')).toBe(false);
    expect(shouldSuppressRepeat(FUND, failedJustNow, 'retry the payment')).toBe(false);
    expect(shouldSuppressRepeat(FUND, failedJustNow, 'réessayer')).toBe(false);
  });

  it('never blocks a DIFFERENT action', () => {
    const otherDeal = { tool: 'fund_milestone', args: { ...FUND.args, milestone_id: 'ms-2' } };
    expect(shouldSuppressRepeat(otherDeal, failedJustNow, 'my payment API is down')).toBe(false);
    // Switching to the wallet is a different funding source - allow it.
    const fromWallet = { tool: 'fund_milestone', args: { milestone_id: 'ms-1' } };
    expect(shouldSuppressRepeat(fromWallet, failedJustNow, 'use my wallet instead')).toBe(false);
  });

  it('stops holding back once the cool-off has passed', () => {
    const old = { ...failedJustNow, at: Date.now() - 11 * 60 * 1000 };
    expect(shouldSuppressRepeat(FUND, old, 'my payment API is down')).toBe(false);
  });

  it('does nothing when nothing has failed', () => {
    expect(shouldSuppressRepeat(FUND, undefined, 'fund the laptop deal')).toBe(false);
  });
});

describe('asksToRetry', () => {
  it('recognises a plain request to try again', () => {
    expect(asksToRetry('try again')).toBe(true);
    expect(asksToRetry('Please retry')).toBe(true);
  });

  it('does not read a complaint as a retry', () => {
    expect(asksToRetry('My payment API is down')).toBe(false);
    expect(asksToRetry('stop the above transaction for now')).toBe(false);
  });
});
