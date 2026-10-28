import { describe, expect, it } from 'vitest';

import { isSameNumber, textContainsNumber } from './phone';

/**
 * These back the rule that a Mobile Money number may only be charged when the
 * USER put it forward. The dangerous case is a near-miss: an assistant that
 * "completes" a half-remembered number must not be able to pass it off as the
 * real one, so matching has to be exact on the subscriber part.
 */
describe('isSameNumber', () => {
  it('matches the same number written different ways', () => {
    expect(isSameNumber('677123456', '+237677123456')).toBe(true);
    expect(isSameNumber('+237 677-12-34-56', '237677123456')).toBe(true);
    expect(isSameNumber('0677123456', '+237677123456')).toBe(true);
  });

  it('refuses a number that is merely SIMILAR', () => {
    // The real case: the model proposed +237670000000 for a user whose number
    // is +237670010386. Close enough to look plausible, and completely wrong.
    expect(isSameNumber('+237670000000', '+237670010386')).toBe(false);
    // One digit different is a different person's phone.
    expect(isSameNumber('+237677123456', '+237677123457')).toBe(false);
  });

  it('never matches on something too short to be a phone number', () => {
    expect(isSameNumber('1234', '1234')).toBe(false);
    expect(isSameNumber('', '')).toBe(false);
  });
});

describe('textContainsNumber', () => {
  it('finds a number the user typed, however they spaced it', () => {
    expect(textContainsNumber('pay from 677 123 456 please', '+237677123456')).toBe(true);
    expect(textContainsNumber('use +237677123456', '677123456')).toBe(true);
    expect(textContainsNumber('my number is 0677-123-456', '+237677123456')).toBe(true);
  });

  it('does not find a number nobody mentioned', () => {
    expect(textContainsNumber('fund the laptop deal', '+237677123456')).toBe(false);
    expect(textContainsNumber('my payment API is down', '+237670000000')).toBe(false);
  });
});
