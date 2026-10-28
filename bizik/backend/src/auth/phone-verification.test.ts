import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

/**
 * Phone verification is a temporary bypass, not an option.
 *
 * The number is this platform's identity: deals are invited by phone before the
 * invitee has an account, transfers route to one, and password reset goes
 * there. The switch exists only because SMS delivery was blocked upstream (a
 * Twilio trial account rejects every unverified number, which silently stopped
 * all nine signups in September 2026). These tests make sure the bypass stays
 * opt-in, explicit, and impossible to end up in by default.
 */
describe('phone verification switch', () => {
  const env = readFileSync('src/config/env.ts', 'utf8');
  const auth = readFileSync('src/auth/auth.service.ts', 'utf8');

  it('is REQUIRED unless the environment explicitly says otherwise', () => {
    // `!== 'false'` means anything - unset, empty, a typo - keeps it ON.
    expect(env).toMatch(/phoneVerificationRequired:\s*process\.env\.PHONE_VERIFICATION_REQUIRED\s*!==\s*'false'/);
  });

  it('never records an unproven number as verified', () => {
    // The bypass issues a session; it must NOT set phoneVerified, or the claim
    // would outlive the switch and those users would never be asked again.
    const registerBlock = auth.slice(auth.indexOf('async register'), auth.indexOf('async login'));
    const bypassBlock = registerBlock.slice(registerBlock.indexOf('phoneVerificationRequired'));
    expect(bypassBlock).not.toMatch(/phoneVerified:\s*true/);
  });

  it('keeps the verification code path in place for when it is turned back on', () => {
    expect(auth).toMatch(/await sendPhoneCodeFor\(phoneNumber\)/);
    expect(auth).toMatch(/async verifyPhoneCode/);
  });

  it('announces itself at boot so it cannot be forgotten', () => {
    const server = readFileSync('src/server.ts', 'utf8');
    expect(server).toMatch(/PHONE VERIFICATION IS OFF/);
    expect(server).toMatch(/OVERDUE/);
  });
});
