import { describe, expect, it } from 'vitest';

import { identityProviderConfigured, verifyIdentity } from './kyc-provider';

/**
 * These scores are a stand-in: they are derived from the ID NUMBER and never
 * open the images, so a photo of a laptop scores exactly like a passport. That
 * is fine for development - what is NOT fine is presenting them to a reviewer
 * as if a provider had checked something. These tests hold the line on the flag
 * that keeps the console honest.
 */
describe('verifyIdentity (stand-in provider)', () => {
  const submission = {
    idType: 'NATIONAL_ID',
    idNumber: '123456789',
    country: 'Cameroon',
    fullName: 'Maxime Ti',
  };

  it('always marks its results as simulated while no provider is connected', async () => {
    expect(identityProviderConfigured()).toBe(false);
    const result = await verifyIdentity(submission);
    expect(result.simulated).toBe(true);
  });

  it('marks the failure and review paths as simulated too', async () => {
    for (const idNumber of ['FAIL123', 'REVIEW99']) {
      const result = await verifyIdentity({ ...submission, idNumber });
      expect(result.simulated, idNumber).toBe(true);
    }
  });

  it('scores the SAME submission identically - proving nothing is examined', async () => {
    // Same ID number, same scores. The documents are not an input at all, which
    // is exactly why the console must not present these as a verdict.
    const first = await verifyIdentity(submission);
    const second = await verifyIdentity(submission);
    expect(second.selfieScore).toBe(first.selfieScore);
    expect(second.matchScore).toBe(first.matchScore);
    expect(second.confidence).toBe(first.confidence);
  });

  it('flatters any ordinary submission, which is the trap being guarded against', async () => {
    const result = await verifyIdentity({ ...submission, idNumber: '000000000' });
    expect(result.selfieScore).toBeGreaterThan(0.9);
    expect(result.matchScore).toBeGreaterThan(0.85);
  });
});
