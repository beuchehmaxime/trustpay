import { describe, expect, it } from 'vitest';

import { BASIC_TIER, tierAfterEarning } from './kyc-gate';
import { config } from '../config/env';

/**
 * What each tier is worth, and the one rule that keeps it safe.
 *
 * Phone proven -> Tier 1. Identity documents approved -> Tier 2. Both are
 * "achieved X, therefore at least tier N", and every one of them used to be a
 * plain assignment - which quietly makes each achievement capable of UNDOING a
 * bigger one. These pin the ladder and the no-demotion rule together, because
 * the rule only matters while the ladder has more than one rung.
 */
describe('KYC tiers', () => {
  const STANDARD_TIER = config.kyc.standardTier;

  it('places a proven phone below the bar for moving money', () => {
    expect(BASIC_TIER).toBe(1);
    expect(STANDARD_TIER).toBe(2);
    // The whole point of Tier 1: a real, reachable person, but not yet somebody
    // allowed to send or withdraw. If these ever collapse into one number, a
    // phone code alone would unlock the money rails.
    expect(BASIC_TIER).toBeLessThan(STANDARD_TIER);
  });

  it('awards the tier when the holder has none', () => {
    expect(tierAfterEarning(0, BASIC_TIER)).toBe(1);
    expect(tierAfterEarning(0, STANDARD_TIER)).toBe(2);
  });

  it('moves a phone-verified holder up when their documents are approved', () => {
    expect(tierAfterEarning(BASIC_TIER, STANDARD_TIER)).toBe(2);
  });

  it('NEVER demotes: re-proving a phone cannot cost a verified holder their tier', () => {
    // The bug this exists to prevent. A Tier 2 customer re-verifies their phone
    // number - on a new device, say - and a plain assignment would drop them to
    // Tier 1, locking them out of their own money with no explanation and every
    // appearance of fraud.
    expect(tierAfterEarning(STANDARD_TIER, BASIC_TIER)).toBe(STANDARD_TIER);
  });

  it('NEVER demotes: approving a submission cannot cost an enhanced holder their tier', () => {
    const ENHANCED_TIER = 3;
    expect(tierAfterEarning(ENHANCED_TIER, STANDARD_TIER)).toBe(ENHANCED_TIER);
  });

  it('is idempotent, so repeating an achievement changes nothing', () => {
    expect(tierAfterEarning(BASIC_TIER, BASIC_TIER)).toBe(BASIC_TIER);
    expect(tierAfterEarning(STANDARD_TIER, STANDARD_TIER)).toBe(STANDARD_TIER);
  });
});
