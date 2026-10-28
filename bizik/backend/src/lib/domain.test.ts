import { describe, expect, it } from 'vitest';

import { CURRENCY_META, fromUsd, homeCurrencyFor, toUsd } from './domain';

describe('homeCurrencyFor', () => {
  it('maps known countries to their home currency', () => {
    expect(homeCurrencyFor('Nigeria')).toBe('NGN');
    expect(homeCurrencyFor('Ghana')).toBe('GHS');
    expect(homeCurrencyFor('Cameroon')).toBe('XAF');
    expect(homeCurrencyFor('France')).toBe('EUR');
    expect(homeCurrencyFor('United Kingdom')).toBe('GBP');
    expect(homeCurrencyFor('United States')).toBe('USD');
  });

  it('trims whitespace before matching', () => {
    expect(homeCurrencyFor('  Cameroon  ')).toBe('XAF');
  });

  it('accepts an ISO code as well as a name', () => {
    // Early WhatsApp signups stored "CM"; an unmapped country silently became
    // USD, showing a Cameroonian user dollars when they meant FCFA.
    expect(homeCurrencyFor('CM')).toBe('XAF');
    expect(homeCurrencyFor('NG')).toBe('NGN');
    expect(homeCurrencyFor('gh')).toBe('GHS');
    expect(homeCurrencyFor('FR')).toBe('EUR');
  });

  it('falls back to USD for unknown or missing countries', () => {
    expect(homeCurrencyFor('Atlantis')).toBe('USD');
    expect(homeCurrencyFor(null)).toBe('USD');
    expect(homeCurrencyFor(undefined)).toBe('USD');
    expect(homeCurrencyFor('')).toBe('USD');
  });
});

describe('toUsd / fromUsd', () => {
  it('treats USD as a 1:1 identity', () => {
    expect(toUsd(100, 'USD')).toBe(100);
    expect(fromUsd(100, 'USD')).toBe(100);
  });

  it('converts a known currency using its CURRENCY_META rate', () => {
    expect(toUsd(100, 'EUR')).toBeCloseTo(100 * CURRENCY_META.EUR.usd, 10);
    // 1512.4 NGN ≈ 1 USD, so a large NGN amount is a small USD figure.
    expect(toUsd(1512.4, 'NGN')).toBeCloseTo(1, 10);
  });

  it('round-trips an amount through USD and back', () => {
    for (const currency of ['EUR', 'GBP', 'NGN', 'GHS', 'XAF'] as const) {
      const amount = 250.75;
      expect(fromUsd(toUsd(amount, currency), currency)).toBeCloseTo(amount, 8);
    }
  });
});
