import { describe, expect, it } from 'vitest';

import {
  clientServiceFee,
  expressWithdrawalFee,
  feeBreakdown,
  freelancerFee,
  releaseNet,
  round2,
} from './fees';
import { feeSettings } from './settings';

/**
 * These tests assume the default (config-seeded) fee percentages, which hold
 * whenever the FEE_* env vars are unset - as in CI. We assert the assumption up
 * front so a config change surfaces here loudly instead of as a mystery failure.
 */
describe('fees - default configuration', () => {
  it('uses the documented default percentages', () => {
    // What bizik.cm/pricing promises: 2.5% once at funding, nothing at release.
    const settings = feeSettings();
    expect(settings.clientServicePct).toBe(0.025);
    expect(settings.freelancerFeePct).toBe(0);
    expect(settings.expressWithdrawalPct).toBe(0.015);
    expect(settings.fxMarginPct).toBe(0.012);
  });
});

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(3.14159)).toBe(3.14);
    expect(round2(1.014)).toBe(1.01);
    expect(round2(1.016)).toBe(1.02);
  });

  it('corrects the classic binary-float half-up case', () => {
    // 2.675 * 100 is 267.4999… in IEEE-754; the Number.EPSILON nudge fixes it.
    expect(round2(2.675)).toBe(2.68);
  });

  it('leaves whole numbers and zero untouched', () => {
    expect(round2(0)).toBe(0);
    expect(round2(5)).toBe(5);
  });

  it('handles negative amounts', () => {
    expect(round2(-1.014)).toBe(-1.01);
    expect(round2(-2.5)).toBe(-2.5);
  });
});

describe('expressWithdrawalFee', () => {
  it('applies the express percentage and rounds', () => {
    expect(expressWithdrawalFee(100)).toBe(1.5);
    expect(expressWithdrawalFee(1000)).toBe(15);
    expect(expressWithdrawalFee(333)).toBe(5); // round2(4.995)
  });

  it('is zero for a zero withdrawal', () => {
    expect(expressWithdrawalFee(0)).toBe(0);
  });

  it('matches the configured percentage exactly', () => {
    const amount = 742.5;
    expect(expressWithdrawalFee(amount)).toBe(
      round2(amount * feeSettings().expressWithdrawalPct),
    );
  });
});

describe('client/freelancer fees', () => {
  it('charges the client service fee on top of the milestone', () => {
    expect(clientServiceFee(100)).toBe(2.5);
    expect(clientServiceFee(0)).toBe(0);
  });

  it('pays the seller the full amount at release', () => {
    expect(freelancerFee(100)).toBe(0);
    expect(releaseNet(100)).toBe(100);
  });

  it('never releases a negative amount', () => {
    for (const amount of [0, 1, 99.99, 100000, 2_500_000]) {
      expect(releaseNet(amount)).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces a consistent full breakdown', () => {
    expect(feeBreakdown(100)).toEqual({
      amount: 100,
      clientFee: 2.5,
      fundingTotal: 102.5,
      freelancerFee: 0,
      releaseNet: 100,
    });
  });
});
