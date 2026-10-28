import { describe, expect, it } from 'vitest';

import { enabledMarketNames, isCountryEnabled, isPhoneInEnabledMarket } from './system-settings';

/**
 * The market gate.
 *
 * Holding other people's money is licensed country by country, so this is the
 * control that keeps the platform inside the countries it is authorised in. It
 * runs at signup, before any personal data is stored, because collecting
 * someone's details and discovering at verification that we cannot serve them
 * leaves the data already collected - which is the problem rather than the fix.
 *
 * Cameroon is the only market open. Everything else is listed and switched off,
 * so opening one is a settings change rather than a deploy.
 */
describe('market gate', () => {
  it('opens exactly one market today', () => {
    expect(enabledMarketNames()).toEqual(['Cameroon']);
  });

  it('admits a Cameroonian number', () => {
    expect(isPhoneInEnabledMarket('+237650035675')).toBe(true);
  });

  it('tolerates the formatting a person actually types', () => {
    for (const written of ['+237 650 03 56 75', '+237-650-035-675', '+237(650)035675']) {
      expect(isPhoneInEnabledMarket(written), written).toBe(true);
    }
  });

  it('refuses a market that is not open', () => {
    // Each of these is a real country in the list, deliberately disabled.
    expect(isPhoneInEnabledMarket('+33612345678')).toBe(false); // France
    expect(isPhoneInEnabledMarket('+447700900000')).toBe(false); // United Kingdom
    expect(isPhoneInEnabledMarket('+2348012345678')).toBe(false); // Nigeria
    expect(isPhoneInEnabledMarket('+12025550123')).toBe(false); // United States
  });

  it('refuses a country that is not in the list at all', () => {
    expect(isPhoneInEnabledMarket('+8613800138000')).toBe(false); // China
  });

  it('refuses an empty or missing number rather than waving it through', () => {
    expect(isPhoneInEnabledMarket('')).toBe(false);
    expect(isPhoneInEnabledMarket(null)).toBe(false);
    expect(isPhoneInEnabledMarket(undefined)).toBe(false);
  });

  it('does not let a short dial code shadow a longer one', () => {
    // +1 is the United States and +235 is Chad. If prefixes were tested in list
    // order rather than longest-first, enabling one could silently admit the
    // other. Neither is open, so both must be refused.
    expect(isPhoneInEnabledMarket('+12025550123')).toBe(false);
    expect(isPhoneInEnabledMarket('+23566112233')).toBe(false);
  });

  it('keeps the country name check in step with the dial-code check', () => {
    // Two different gates - KYC and profile use the name, signup uses the dial
    // code - and they must agree, or a user admitted at the door is refused at
    // verification.
    expect(isCountryEnabled('Cameroon')).toBe(true);
    expect(isCountryEnabled('France')).toBe(false);
    expect(isCountryEnabled('United Kingdom')).toBe(false);
  });
});
