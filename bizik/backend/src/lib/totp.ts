import { authenticator } from 'otplib';

import { config } from '../config/env';

// SRS FR-AUTH-004: TOTP codes valid for 30s (allow +/-1 step for clock drift).
authenticator.options = { step: 30, window: 1 };

/** Generate a new base32 TOTP secret for authenticator-app enrolment. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** Build the otpauth:// URI a user scans into Google Authenticator etc. */
export function totpUri(secret: string, accountName: string): string {
  return authenticator.keyuri(accountName, config.totp.issuer, secret);
}

/** Verify a 6-digit TOTP code against the user's secret. */
export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}
