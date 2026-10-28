import { describe, expect, it } from 'vitest';

import {
  hashToken,
  numericOtp,
  signAccessToken,
  signReceiptToken,
  verifyAccessToken,
  verifyReceiptToken,
} from './jwt';

describe('receipt tokens', () => {
  it('round-trips userId and reference', () => {
    const token = signReceiptToken('user-123', 'QTQ-REF-789');
    expect(verifyReceiptToken(token)).toEqual({
      userId: 'user-123',
      reference: 'QTQ-REF-789',
    });
  });

  it('rejects a normal access token (wrong token type)', () => {
    const accessToken = signAccessToken({ sub: 'user-123', role: 'USER' });
    expect(() => verifyReceiptToken(accessToken)).toThrow();
  });

  it('rejects garbage input', () => {
    expect(() => verifyReceiptToken('not-a-jwt')).toThrow();
    expect(() => verifyReceiptToken('')).toThrow();
  });
});

describe('token helpers', () => {
  it('hashToken is deterministic and hex-encoded', () => {
    const first = hashToken('a-token');
    const second = hashToken('a-token');
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('different')).not.toBe(first);
  });

  it('numericOtp returns a zero-padded code of the requested length', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = numericOtp(6);
      expect(code).toMatch(/^[0-9]{6}$/);
    }
    expect(numericOtp(4)).toMatch(/^[0-9]{4}$/);
  });
});

describe('token type confusion', () => {
  it('refuses a receipt token where an access token is expected', () => {
    // Receipt tokens are signed with the same secret and travel in shareable
    // URLs (and proxy logs). Without a type check, one could be replayed as a
    // full session against any authenticated endpoint.
    const receipt = signReceiptToken('user-1', 'TXN-1');
    expect(() => verifyAccessToken(receipt)).toThrow(/access token/i);
  });

  it('still accepts a real access token', () => {
    const access = signAccessToken({ sub: 'user-1', role: 'CLIENT' });
    expect(verifyAccessToken(access).sub).toBe('user-1');
  });
});
