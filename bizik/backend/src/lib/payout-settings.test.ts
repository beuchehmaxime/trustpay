import { describe, expect, it } from 'vitest';

import { payoutSettings, systemSettings } from './system-settings';

/**
 * Settings that were added after the settings row was written.
 *
 * A stored settings object only holds the keys that existed when it was saved.
 * Reading a NEW key straight off it gives `undefined`, and `undefined` does not
 * announce itself - it compares false against everything and prints as the word
 * "undefined". That is exactly how an operator alert went out reading "below
 * the undefined XAF warning level": the default was written into
 * payoutSettings() and the caller read around it, from the raw object.
 *
 * So the rule these pin is that payoutSettings() always returns real numbers,
 * whatever the stored row is missing.
 */
describe('payout settings defaults', () => {
  it('returns a usable threshold even when the stored settings predate the field', () => {
    // Exactly the production situation: a payouts object saved before
    // floatWarningXaf existed.
    const stored = systemSettings().providers.payouts as unknown as Record<string, unknown>;
    const original = stored.floatWarningXaf;
    delete stored.floatWarningXaf;

    try {
      const settings = payoutSettings();
      expect(settings.floatWarningXaf).toBeTypeOf('number');
      expect(Number.isFinite(settings.floatWarningXaf)).toBe(true);
      expect(settings.floatWarningXaf).toBeGreaterThan(0);
      // The thing that actually reached an operator's screen.
      expect(`${settings.floatWarningXaf}`).not.toContain('undefined');
    } finally {
      stored.floatWarningXaf = original;
    }
  });

  it('every figure it returns is a real number, not undefined', () => {
    const stored = systemSettings().providers.payouts as unknown as Record<string, unknown>;
    const saved = { ...stored };
    for (const key of Object.keys(stored)) delete stored[key];

    try {
      const settings = payoutSettings();
      expect(Number.isFinite(settings.approvalThresholdXaf)).toBe(true);
      expect(Number.isFinite(settings.floatWarningXaf)).toBe(true);
      expect(typeof settings.automaticPayouts).toBe('boolean');
    } finally {
      Object.assign(stored, saved);
    }
  });

  it('honours a stored value when there is one', () => {
    const stored = systemSettings().providers.payouts as unknown as Record<string, unknown>;
    const original = stored.floatWarningXaf;
    stored.floatWarningXaf = 90_000;

    try {
      expect(payoutSettings().floatWarningXaf).toBe(90_000);
    } finally {
      stored.floatWarningXaf = original;
    }
  });

  it('treats 0 as a deliberate "switch the check off", not as missing', () => {
    const stored = systemSettings().providers.payouts as unknown as Record<string, unknown>;
    const original = stored.floatWarningXaf;
    stored.floatWarningXaf = 0;

    try {
      // 0 is finite, so it must survive rather than being replaced by the
      // default - otherwise an operator could never turn the alert off.
      expect(payoutSettings().floatWarningXaf).toBe(0);
    } finally {
      stored.floatWarningXaf = original;
    }
  });
});
