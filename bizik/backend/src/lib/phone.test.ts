import { describe, expect, it } from 'vitest';

import { isValidPhone, normalizePhone, toMsisdn } from './phone';

describe('normalizePhone', () => {
  it('reduces any formatting to +digits', () => {
    expect(normalizePhone('+237 677-12 34 56')).toBe('+237677123456');
    expect(normalizePhone('(237) 677.123.456')).toBe('+237677123456');
  });
});

describe('toMsisdn', () => {
  it('adds the country dialling code to a locally-typed number', () => {
    // What someone actually types when asked for their Mobile Money number.
    expect(toMsisdn('677123456', 'Cameroon')).toBe('+237677123456');
    expect(toMsisdn('0677123456', 'Cameroon')).toBe('+237677123456');
    expect(toMsisdn('08012345678', 'Nigeria')).toBe('+2348012345678');
  });

  it('leaves an international number alone', () => {
    expect(toMsisdn('+237677123456', 'Cameroon')).toBe('+237677123456');
    expect(toMsisdn('237677123456', 'Cameroon')).toBe('+237677123456');
    // Country mismatch must not double-prefix a number already in E.164.
    expect(toMsisdn('+237677123456', 'Nigeria')).toBe('+237677123456');
  });

  it('falls back to the primary mobile-money market when country is unknown', () => {
    expect(toMsisdn('677123456', null)).toBe('+237677123456');
    expect(toMsisdn('677123456', 'Atlantis')).toBe('+237677123456');
  });

  it('produces numbers that pass validation, so nothing is charged blind', () => {
    expect(isValidPhone(toMsisdn('677123456', 'Cameroon'))).toBe(true);
    // Junk stays junk - the caller refuses it rather than sending a request.
    expect(isValidPhone(toMsisdn('12', 'Cameroon'))).toBe(false);
  });
});
