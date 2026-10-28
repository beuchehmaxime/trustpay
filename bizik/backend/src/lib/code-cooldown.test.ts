import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * How long someone waits between one-time codes.
 *
 * The rule is deliberately uneven: the first code is instant, a first resend
 * waits a minute, and every resend after that waits five. A first resend is
 * usually a mistyped number or a slow network and should not be punished; a
 * third is someone holding the button down or a script, and each code is a
 * real message that costs money and lands on a real phone.
 *
 * The property that actually broke in production is the one at the bottom: a
 * refusal has to be RETURNED. When it was swallowed, the API still answered
 * "we sent you a code", and the user sat watching for a message that was never
 * coming.
 */

// A tiny in-memory Redis with real TTL semantics, because the escalation IS
// the TTL arithmetic - mocking it away would test nothing.
const store = new Map<string, { value: string; expiresAt: number | null }>();
let now = 1_000_000;

function live(key: string) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return entry;
}

vi.mock('./redis', () => ({
  redis: {
    get: async (key: string) => live(key)?.value ?? null,
    set: async (key: string, value: string, options?: { EX?: number }) => {
      store.set(key, {
        value,
        expiresAt: options?.EX ? now + options.EX * 1000 : null,
      });
      return 'OK';
    },
    incr: async (key: string) => {
      const next = String(Number(live(key)?.value ?? '0') + 1);
      store.set(key, { value: next, expiresAt: live(key)?.expiresAt ?? null });
      return Number(next);
    },
    expire: async (key: string, seconds: number) => {
      const entry = live(key);
      if (entry) entry.expiresAt = now + seconds * 1000;
      return 1;
    },
    ttl: async (key: string) => {
      const entry = live(key);
      if (!entry) return -2;
      if (entry.expiresAt === null) return -1;
      return Math.ceil((entry.expiresAt - now) / 1000);
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
  },
}));

import {
  claimCodeSend,
  clearCodeCooldown,
  codeCooldownError,
  describeWait,
  FIRST_RESEND_WAIT_SECONDS,
  LATER_RESEND_WAIT_SECONDS,
  MAX_CODES_PER_DAY,
} from './code-cooldown';

const PHONE = '+237670000001';
const advance = (seconds: number) => {
  now += seconds * 1000;
};

describe('the wait between one-time codes', () => {
  beforeEach(() => {
    store.clear();
    now = 1_000_000;
  });

  it('sends the FIRST code immediately - nobody waits to start', async () => {
    const first = await claimCodeSend('phone-verification', PHONE);
    expect(first.allowed).toBe(true);
  });

  it('makes the first resend wait one minute', async () => {
    await claimCodeSend('phone-verification', PHONE);

    const tooSoon = await claimCodeSend('phone-verification', PHONE);
    expect(tooSoon).toMatchObject({ allowed: false, reason: 'cooldown' });
    if (tooSoon.allowed) throw new Error('unreachable');
    expect(tooSoon.retryAfterSeconds).toBeLessThanOrEqual(FIRST_RESEND_WAIT_SECONDS);
    expect(tooSoon.retryAfterSeconds).toBeGreaterThan(0);

    advance(FIRST_RESEND_WAIT_SECONDS);
    expect((await claimCodeSend('phone-verification', PHONE)).allowed).toBe(true);
  });

  it('makes the SECOND resend, and every one after it, wait five minutes', async () => {
    await claimCodeSend('phone-verification', PHONE); // code 1
    advance(FIRST_RESEND_WAIT_SECONDS);
    await claimCodeSend('phone-verification', PHONE); // code 2, the first resend

    // A minute is no longer enough.
    advance(FIRST_RESEND_WAIT_SECONDS);
    const stillTooSoon = await claimCodeSend('phone-verification', PHONE);
    expect(stillTooSoon.allowed).toBe(false);

    advance(LATER_RESEND_WAIT_SECONDS - FIRST_RESEND_WAIT_SECONDS);
    expect((await claimCodeSend('phone-verification', PHONE)).allowed).toBe(true); // code 3

    // And it stays at five minutes rather than escalating further or relaxing.
    advance(FIRST_RESEND_WAIT_SECONDS);
    expect((await claimCodeSend('phone-verification', PHONE)).allowed).toBe(false);
    advance(LATER_RESEND_WAIT_SECONDS);
    expect((await claimCodeSend('phone-verification', PHONE)).allowed).toBe(true); // code 4
  });

  it('always says HOW LONG, which is the whole point', async () => {
    // The bug this replaces: the refusal was a bare `false`, the caller
    // returned "verification required" anyway, and the user got a screen with
    // no code and no explanation.
    await claimCodeSend('phone-verification', PHONE);
    const refusal = await claimCodeSend('phone-verification', PHONE);

    if (refusal.allowed) throw new Error('expected a refusal');
    expect(typeof refusal.retryAfterSeconds).toBe('number');
    expect(refusal.retryAfterSeconds).toBeGreaterThan(0);
    expect(refusal.reason).toBe('cooldown');
  });

  it('tells a caller the next wait up front, so a countdown can start right away', async () => {
    const first = await claimCodeSend('phone-verification', PHONE);
    if (!first.allowed) throw new Error('expected the first to be allowed');
    expect(first.nextWaitSeconds).toBe(FIRST_RESEND_WAIT_SECONDS);

    advance(FIRST_RESEND_WAIT_SECONDS);
    const second = await claimCodeSend('phone-verification', PHONE);
    if (!second.allowed) throw new Error('expected the second to be allowed');
    expect(second.nextWaitSeconds).toBe(LATER_RESEND_WAIT_SECONDS);
  });

  it('keeps each flow on its own clock, so signing in does not block a password reset', async () => {
    await claimCodeSend('phone-verification', PHONE);
    // Different job, different escalation - being mid-signup must not lock
    // somebody out of recovering their password.
    expect((await claimCodeSend('password-reset', PHONE)).allowed).toBe(true);
    expect((await claimCodeSend('payout-method', PHONE)).allowed).toBe(true);
  });

  it('counts the DAILY ceiling across every flow, because it is one phone', async () => {
    // Scopes get their own cooldown but share the ceiling: the cap is about
    // one number's total exposure to us, whatever the reason for the code.
    const scopes = ['phone-verification', 'password-reset', 'payout-method'] as const;
    let sent = 0;
    for (let round = 0; round < 20 && sent <= MAX_CODES_PER_DAY; round += 1) {
      for (const scope of scopes) {
        const claim = await claimCodeSend(scope, PHONE);
        if (claim.allowed) sent += 1;
        else if (claim.reason === 'daily_cap') {
          expect(sent).toBe(MAX_CODES_PER_DAY);
          expect(claim.retryAfterSeconds).toBeGreaterThan(0);
          return;
        }
      }
      advance(LATER_RESEND_WAIT_SECONDS);
    }
    throw new Error(`daily cap never tripped after ${sent} sends`);
  });

  it('forgets the escalation once a code is actually used', async () => {
    await claimCodeSend('phone-verification', PHONE);
    advance(FIRST_RESEND_WAIT_SECONDS);
    await claimCodeSend('phone-verification', PHONE); // now on the 5-minute rung

    // Someone who needed two codes to get in today should not still be serving
    // a five-minute wait the next time they legitimately need one.
    await clearCodeCooldown('phone-verification', PHONE);

    const afterSuccess = await claimCodeSend('phone-verification', PHONE);
    expect(afterSuccess.allowed).toBe(true);
    if (!afterSuccess.allowed) throw new Error('unreachable');
    expect(afterSuccess.nextWaitSeconds).toBe(FIRST_RESEND_WAIT_SECONDS);
  });

  it('does not let one number\'s wait affect another', async () => {
    await claimCodeSend('phone-verification', PHONE);
    expect((await claimCodeSend('phone-verification', '+237670000002')).allowed).toBe(true);
  });
});

describe('how the wait is worded', () => {
  it('uses seconds for short waits and whole minutes for long ones', () => {
    expect(describeWait(45)).toBe('45 seconds');
    expect(describeWait(60)).toBe('60 seconds');
    expect(describeWait(300)).toBe('5 minutes');
    expect(describeWait(120)).toBe('2 minutes');
  });

  it('never tells someone to wait zero', () => {
    expect(describeWait(0)).toBe('1 seconds');
    expect(describeWait(0.4)).toBe('1 seconds');
  });

  it('rounds up, so the countdown never finishes before the server agrees', () => {
    expect(describeWait(181)).toBe('4 minutes');
  });
});

describe('the error a resend gets', () => {
  it('carries the seconds, so the client can count down instead of guessing', () => {
    const error = codeCooldownError({ retryAfterSeconds: 240, reason: 'cooldown' });
    expect(error.statusCode).toBe(429);
    expect(error.details).toEqual({ retryAfterSeconds: 240 });
    expect(error.message).toMatch(/4 minutes/);
  });

  it('says something different when the DAY is spent, not just the minute', () => {
    // "Wait 9 hours" is not useful advice; "try tomorrow or contact support" is.
    const error = codeCooldownError({ retryAfterSeconds: 33_000, reason: 'daily_cap' });
    expect(error.message).toMatch(/too many codes today/i);
    expect(error.message).not.toMatch(/\d+ minutes/);
  });
});
