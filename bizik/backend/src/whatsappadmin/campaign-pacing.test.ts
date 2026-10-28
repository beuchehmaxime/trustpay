import { beforeEach, describe, expect, it } from 'vitest';

import { config } from '../config/env';
import { batchDelayMs } from './campaign-queue';
import { missingForProvider, outreachProvider } from './campaign-sender';

/**
 * How fast campaigns are allowed to go, and which rail carries them.
 *
 * The pace is the thing standing between a campaign and a banned number. Bulk
 * unprompted messages from a QR-linked WhatsApp account are exactly the traffic
 * abuse detection looks for, and the account carrying them is the same one that
 * carries verification codes - so losing it costs sign-ups as well as outreach.
 *
 * The code this replaced sent one message every 120ms. These pin that it cannot
 * come back by accident.
 */
const whatsapp = config.whatsapp as {
  outreachProvider: 'meta' | 'wasender';
  outreachPerMinute: number;
  outreachDailyCap: number;
  outreachMinGapMs: number;
};
const wasender = config.wasender as { apiKey: string };

describe('campaign pacing', () => {
  beforeEach(() => {
    whatsapp.outreachPerMinute = 10;
    whatsapp.outreachMinGapMs = 6_000;
  });

  it('NEVER returns a gap under the provider refusal window', () => {
    // The bug this replaced: WasenderAPI's account protection refuses a second
    // message inside five seconds and records it as a failure, not a wait.
    // Pacing batches of three instead of messages meant one in three landed -
    // 52 of the first 58 live sends were lost to it.
    for (const perMinute of [10, 30, 60, 120, 600, 1, 0]) {
      whatsapp.outreachPerMinute = perMinute;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        expect(batchDelayMs()).toBeGreaterThanOrEqual(6_000);
      }
    }
  });

  it('jitters UPWARDS only, so no single gap can dip under the floor', () => {
    whatsapp.outreachPerMinute = 10; // exactly the 6s floor
    const samples = Array.from({ length: 60 }, () => batchDelayMs());
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(6_000);
    expect(Math.max(...samples)).toBeGreaterThan(6_000);
  });

  it('honours a floor raised for a stricter account', () => {
    whatsapp.outreachMinGapMs = 15_000;
    whatsapp.outreachPerMinute = 60; // would be 1s without the floor
    expect(batchDelayMs()).toBeGreaterThanOrEqual(15_000);
  });

  it('never returns the sub-second spacing the original loop used', () => {
    // The in-process loop this all replaced slept 120ms between sends.
    whatsapp.outreachPerMinute = 600; // absurd, deliberately
    expect(batchDelayMs()).toBeGreaterThanOrEqual(6_000);
  });

  it('jitters, so the cadence is not a perfectly regular machine signature', () => {
    const samples = new Set<number>();
    for (let attempt = 0; attempt < 40; attempt += 1) samples.add(batchDelayMs());
    expect(samples.size).toBeGreaterThan(5);
  });

  it('goes slower when configured to, above the floor', () => {
    whatsapp.outreachPerMinute = 2; // 30s apart, well clear of the floor
    expect(batchDelayMs()).toBeGreaterThanOrEqual(30_000);
  });

  it('does not divide by zero when somebody configures 0 a minute', () => {
    whatsapp.outreachPerMinute = 0;
    const delay = batchDelayMs();
    expect(Number.isFinite(delay)).toBe(true);
    expect(delay).toBeGreaterThan(0);
  });

  it('keeps a daily ceiling, because a slow flood is still a flood', () => {
    expect(config.whatsapp.outreachDailyCap).toBeGreaterThan(0);
  });
});

describe('outreach rail selection', () => {
  beforeEach(() => {
    whatsapp.outreachProvider = 'wasender';
    wasender.apiKey = 'test-key';
  });

  it('uses WasenderAPI when it is selected and configured', () => {
    expect(outreachProvider()).toBe('wasender');
  });

  it('falls back to Meta rather than sending nothing when the key is missing', () => {
    wasender.apiKey = '';
    expect(outreachProvider()).toBe('meta');
  });

  it('switches back to Meta on one setting, so the rail is not a rewrite', () => {
    whatsapp.outreachProvider = 'meta';
    expect(outreachProvider()).toBe('meta');
  });

  describe('what each rail needs before a campaign may be created', () => {
    it('demands the message text on the free-text rail', () => {
      // A template name is meaningless to WasenderAPI - it sends prose.
      expect(missingForProvider({ template: 'bizik_nudge', body: null })).toMatch(/message body/i);
      expect(missingForProvider({ template: 'bizik_nudge', body: '   ' })).toMatch(/message body/i);
      expect(missingForProvider({ template: '', body: 'Hello from Bizik' })).toBeNull();
    });

    it('demands an approved template on the Meta rail', () => {
      whatsapp.outreachProvider = 'meta';
      // Prose alone would be refused by Meta for every single recipient.
      expect(missingForProvider({ template: '', body: 'Hello from Bizik' })).toMatch(/template/i);
      expect(missingForProvider({ template: 'bizik_nudge', body: null })).toBeNull();
    });
  });
});
