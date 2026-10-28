import { describe, expect, it } from 'vitest';

import { defaultSettings } from './system-settings';

/**
 * Identity is the gate in front of creating deals and sending money, so who
 * gets verified is a decision a person makes. Submitting documents must never
 * be the same thing as passing - these pin the default that guarantees it.
 */
describe('verification defaults', () => {
  it('never auto-approves a submission without a human', () => {
    expect(defaultSettings().verification.autoApproveOnPass).toBe(false);
  });

  it('routes weak submissions to review rather than silently rejecting them', () => {
    expect(defaultSettings().verification.manualReviewOnLowConfidence).toBe(true);
  });

  it('keeps sanctions screening and its freeze on by default', () => {
    const verification = defaultSettings().verification;
    expect(verification.sanctionsScreeningEnabled).toBe(true);
    expect(verification.amlAutoFreeze).toBe(true);
  });

  it('requires a real tier for a verified account, so tier 0 is never "verified"', () => {
    expect(defaultSettings().verification.standardTier).toBeGreaterThan(0);
  });
});
