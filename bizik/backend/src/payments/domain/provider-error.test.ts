import { describe, expect, it } from 'vitest';

import {
  ProviderRequestError,
  asProviderRequestError,
  deliveryForHttpStatus,
  deliveryForTransportError,
} from './provider-error';

/**
 * These verdicts decide whether a failed payout refunds the wallet. Getting one
 * wrong means either stranding a user's money ('unknown' when the provider
 * clearly refused) or paying a recipient twice ('rejected' when the payout may
 * actually have gone through). The second is unrecoverable, so anything we are
 * unsure about must land on 'unknown'.
 */
describe('deliveryForHttpStatus', () => {
  it('treats a 4xx as the provider refusing the request', () => {
    expect(deliveryForHttpStatus(400)).toBe('rejected');
    expect(deliveryForHttpStatus(401)).toBe('rejected');
    expect(deliveryForHttpStatus(403)).toBe('rejected');
    expect(deliveryForHttpStatus(422)).toBe('rejected');
  });

  it('treats a 5xx as unknown - the gateway may have accepted it downstream', () => {
    expect(deliveryForHttpStatus(500)).toBe('unknown');
    expect(deliveryForHttpStatus(502)).toBe('unknown');
    expect(deliveryForHttpStatus(504)).toBe('unknown');
  });

  it('treats timeout and rate-limit responses as unknown, not refusals', () => {
    expect(deliveryForHttpStatus(408)).toBe('unknown');
    expect(deliveryForHttpStatus(429)).toBe('unknown');
  });
});

describe('deliveryForTransportError', () => {
  it('knows nothing was sent when the host never resolved or refused the socket', () => {
    expect(deliveryForTransportError({ code: 'ENOTFOUND' })).toBe('rejected');
    expect(deliveryForTransportError({ code: 'ECONNREFUSED' })).toBe('rejected');
    expect(deliveryForTransportError({ code: 'EAI_AGAIN' })).toBe('rejected');
  });

  it('reads the syscall code undici hides on `cause`', () => {
    expect(deliveryForTransportError({ cause: { code: 'ECONNREFUSED' } })).toBe('rejected');
    expect(deliveryForTransportError({ cause: { code: 'ECONNRESET' } })).toBe('unknown');
  });

  it('treats a reset or an unrecognised failure as unknown', () => {
    expect(deliveryForTransportError({ code: 'ECONNRESET' })).toBe('unknown');
    expect(deliveryForTransportError(new Error('socket hang up'))).toBe('unknown');
    expect(deliveryForTransportError(undefined)).toBe('unknown');
  });
});

describe('asProviderRequestError', () => {
  it('passes an already-classified error through untouched', () => {
    const original = new ProviderRequestError('nope', 'rejected', 400);
    expect(asProviderRequestError(original)).toBe(original);
  });

  it('reads the status off an axios-shaped error (the MTN rail)', () => {
    const refused = asProviderRequestError({ message: 'Request failed', response: { status: 400 } });
    expect(refused.delivery).toBe('rejected');
    expect(refused.httpStatus).toBe(400);

    const serverError = asProviderRequestError({ message: 'Bad gateway', response: { status: 502 } });
    expect(serverError.delivery).toBe('unknown');
  });

  it('treats an axios timeout as unknown', () => {
    expect(asProviderRequestError({ message: 'timeout', code: 'ECONNABORTED' }).delivery).toBe('unknown');
    expect(asProviderRequestError({ message: 'timeout', code: 'ETIMEDOUT' }).delivery).toBe('unknown');
  });

  it('defaults an unrecognised throw to unknown rather than assuming safety', () => {
    expect(asProviderRequestError('something odd').delivery).toBe('unknown');
    expect(asProviderRequestError(new Error('boom')).delivery).toBe('unknown');
  });
});
