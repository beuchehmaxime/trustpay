import { describe, expect, it } from 'vitest';

import { decryptField, encryptField } from '../lib/crypto';

/**
 * TOTP shared secrets are encrypted at rest.
 *
 * They were not, while the schema comment said they were - which meant anyone
 * with database read access could mint a valid second factor for every user who
 * had enabled one, and the documentation asserted a control that did not exist.
 * A second factor kept in the clear beside the password hash is not a second
 * factor.
 *
 * The migration path matters as much as the encryption: existing enrolments
 * were stored in plaintext, and a decrypt that threw on them would lock those
 * users out of their own accounts.
 */
describe('TOTP secret storage', () => {
  const SECRET = 'JBSWY3DPEHPK3PXP';

  it('does not store the secret in a readable form', () => {
    const stored = encryptField(SECRET);
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toBe(SECRET);
  });

  it('round-trips exactly, or the code the user types will never match', () => {
    expect(decryptField(encryptField(SECRET))).toBe(SECRET);
  });

  it('produces a different ciphertext each time, so two users sharing a secret are not obvious', () => {
    // A random IV per value. Without it, identical secrets encrypt identically
    // and the database leaks which accounts share one.
    expect(encryptField(SECRET)).not.toBe(encryptField(SECRET));
  });

  it('reads a legacy plaintext secret unchanged rather than throwing', () => {
    // Enrolments made before encryption are still in the database as plain
    // base32. If this threw, every one of those users would be locked out at
    // their next sign-in by a security improvement.
    expect(decryptField(SECRET)).toBe(SECRET);
  });
});
