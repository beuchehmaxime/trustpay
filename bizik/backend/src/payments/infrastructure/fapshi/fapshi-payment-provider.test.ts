import { describe, expect, it, vi } from 'vitest';

import { FapshiPaymentProvider } from './fapshi-payment-provider';

/**
 * Fapshi settles in XAF and its API carries no currency field, so whatever
 * number we post is treated as XAF. A wallet debited in another currency would
 * therefore be paid out in XAF units - roughly 2.5x the value for NGN. These
 * tests pin the adapter's refusal, which is the last line of defence behind the
 * service-level check.
 */
describe('Fapshi adapter currency safety', () => {
  const provider = new FapshiPaymentProvider();

  it('refuses a payout in any currency other than XAF, without calling Fapshi', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(
      provider.initiateDisbursement({
        transactionReference: 'WD-test',
        amount: '1000000',
        currency: 'NGN',
        recipientPhoneNumber: '+237670000000',
        description: 'test',
      }),
    ).rejects.toThrow(/XAF only/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('refuses a collection in another currency too', async () => {
    await expect(
      provider.initiateCollection({
        transactionReference: 'DEP-test',
        amount: '1000',
        currency: 'USD',
        customerPhoneNumber: '+237670000000',
        description: 'test',
      }),
    ).rejects.toThrow(/XAF only/i);
  });

  it('refuses a fractional amount rather than rounding it up', async () => {
    await expect(
      provider.initiateDisbursement({
        transactionReference: 'WD-test',
        amount: '100.4',
        currency: 'XAF',
        recipientPhoneNumber: '+237670000000',
        description: 'test',
      }),
    ).rejects.toThrow(/whole number/i);
  });

  it('classifies the refusal as `rejected`, so the reservation is safely reversed', async () => {
    await provider
      .initiateDisbursement({
        transactionReference: 'WD-test',
        amount: '0',
        currency: 'XAF',
        recipientPhoneNumber: '+237670000000',
        description: 'test',
      })
      .catch((error: { delivery?: string }) => {
        // `unknown` would leave the funds reserved; this never reached Fapshi.
        expect(error.delivery).toBe('rejected');
      });
  });
});
