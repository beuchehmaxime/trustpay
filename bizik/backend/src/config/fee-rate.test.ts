import { describe, expect, it } from 'vitest';

import { parseFeeRate } from './fee-rate';

describe('parseFeeRate', () => {
  it('reads the values production actually shipped with as percentages', () => {
    // FEE_FREELANCER_PCT=10 used to mean a 1000% fee and a negative payout.
    expect(parseFeeRate('10', 0.025).rate).toBeCloseTo(0.1);
    expect(parseFeeRate('5', 0.015).rate).toBeCloseTo(0.05);
    expect(parseFeeRate('1', 0.005).rate).toBeCloseTo(0.01);
  });

  it('honours an explicit zero instead of silently using the default', () => {
    // FEE_CLIENT_PCT=0 used to become the 3.5% default, because 0 is falsy.
    expect(parseFeeRate('0', 0.035).rate).toBe(0);
  });

  it('uses fractions as they are', () => {
    expect(parseFeeRate('0.025', 0.1).rate).toBe(0.025);
  });

  it('treats anything with a percent sign as a percentage', () => {
    expect(parseFeeRate('2.5%', 0.1).rate).toBeCloseTo(0.025);
    expect(parseFeeRate('0.5%', 0.1).rate).toBeCloseTo(0.005);
    expect(parseFeeRate('10%', 0.1).rate).toBeCloseTo(0.1);
  });

  it('falls back to the default when unset or blank', () => {
    expect(parseFeeRate(undefined, 0.035).rate).toBe(0.035);
    expect(parseFeeRate('  ', 0.035).rate).toBe(0.035);
  });

  it('refuses nonsense and absurd fees, and says why', () => {
    for (const raw of ['abc', '-1', '75', '0.9', '1000']) {
      const reading = parseFeeRate(raw, 0.025);
      expect(reading.rate).toBe(0.025);
      expect(reading.note).toBeDefined();
    }
  });

  it('never produces a rate that could make a payout negative', () => {
    for (const raw of ['10', '49', '0.49', '99', '100', '5000', '0.99']) {
      expect(parseFeeRate(raw, 0.025).rate).toBeLessThan(0.5);
    }
  });
});
