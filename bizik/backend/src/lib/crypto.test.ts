import { describe, expect, it } from 'vitest';

import { decryptField, encryptField, maskIdNumber } from './crypto';

describe('encryptField / decryptField', () => {
  it('round-trips a value back to the original plaintext', () => {
    const original = 'AB1234567';
    const ciphertext = encryptField(original);
    expect(ciphertext).not.toBe(original);
    expect(decryptField(ciphertext)).toBe(original);
  });

  it('round-trips unicode and empty strings', () => {
    for (const original of ['', 'Jean-Pierre Ng, 日本語 🌍']) {
      expect(decryptField(encryptField(original))).toBe(original);
    }
  });

  it('produces different ciphertext each time (random IV) for the same input', () => {
    const original = 'same-secret-value';
    const first = encryptField(original);
    const second = encryptField(original);
    expect(first).not.toBe(second);
    // …but both still decrypt to the same plaintext.
    expect(decryptField(first)).toBe(original);
    expect(decryptField(second)).toBe(original);
  });

  it('uses the versioned v1 envelope format', () => {
    const parts = encryptField('x').split('.');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
  });

  it('passes through legacy/plaintext values unchanged', () => {
    expect(decryptField('not-encrypted')).toBe('not-encrypted');
  });
});

describe('maskIdNumber', () => {
  it('shows only the last four characters', () => {
    expect(maskIdNumber('AB1234567')).toBe('•••• 4567');
  });

  it('returns short values as-is', () => {
    expect(maskIdNumber('4567')).toBe('4567');
    expect(maskIdNumber('12')).toBe('12');
  });

  it('trims surrounding whitespace before masking', () => {
    expect(maskIdNumber('  AB1234567  ')).toBe('•••• 4567');
  });
});