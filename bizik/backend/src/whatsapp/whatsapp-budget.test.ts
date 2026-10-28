import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WhatsAppBudget } from './whatsapp-budget';

// A tiny in-memory stand-in for the Redis counters the budget uses.
const counters = new Map<string, number>();
const expiries = new Map<string, number>();

vi.mock('../lib/redis', () => ({
  redis: {
    incr: async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    expire: async (key: string, seconds: number) => {
      expiries.set(key, seconds);
      return true;
    },
  },
}));

vi.mock('../config/env', () => ({
  config: { whatsapp: { aiTurnsPerUserDaily: 3, aiTurnsGlobalDaily: 5 } },
}));

describe('WhatsAppBudget', () => {
  beforeEach(() => {
    counters.clear();
    expiries.clear();
  });

  it('allows turns up to the per-user ceiling, then refuses that user only', async () => {
    expect(await WhatsAppBudget.consumeTurn('user-a')).toBe('ok');
    expect(await WhatsAppBudget.consumeTurn('user-a')).toBe('ok');
    expect(await WhatsAppBudget.consumeTurn('user-a')).toBe('ok');
    expect(await WhatsAppBudget.consumeTurn('user-a')).toBe('user_exhausted');
    // A different number is unaffected by one user burning their allowance.
    expect(await WhatsAppBudget.consumeTurn('user-b')).toBe('ok');
  });

  it('refuses everyone once the platform-wide daily ceiling is reached', async () => {
    // 5 global turns: three from A (its own max), two from B.
    for (let turn = 0; turn < 3; turn += 1) {
      expect(await WhatsAppBudget.consumeTurn('user-a')).toBe('ok');
    }
    expect(await WhatsAppBudget.consumeTurn('user-b')).toBe('ok');
    expect(await WhatsAppBudget.consumeTurn('user-b')).toBe('ok');
    expect(await WhatsAppBudget.consumeTurn('user-b')).toBe('platform_exhausted');
  });

  it('sets an expiry on a counter the first time it is used', async () => {
    await WhatsAppBudget.consumeTurn('user-c');
    expect([...expiries.values()].every((seconds) => seconds > 24 * 60 * 60)).toBe(true);
  });

  it('never blames the user for a platform-wide cap', () => {
    expect(WhatsAppBudget.message('user_exhausted')).toMatch(/limit/i);
    expect(WhatsAppBudget.message('platform_exhausted')).toMatch(/busy/i);
    // Both still point at the menu, which keeps working.
    expect(WhatsAppBudget.message('user_exhausted')).toMatch(/MENU/);
    expect(WhatsAppBudget.message('platform_exhausted')).toMatch(/MENU/);
  });
});
