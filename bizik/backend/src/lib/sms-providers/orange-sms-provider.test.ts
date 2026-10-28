import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '../../config/env';
import { OrangeSmsProvider } from './orange-sms-provider';

/** `config` is readonly by design; tests need to vary it. */
const orangeConfig = config.orangeSms as {
  clientId: string;
  clientSecret: string;
  senderAddress: string;
  senderName: string;
  onNetOnly: boolean;
  receiptUrl: string;
  lowBalanceThreshold: number;
};

/**
 * The Orange API is unforgiving about shape: the sender short code has to
 * appear URL-encoded in the path AND plain in the body, an unapproved sender
 * name is rejected outright, and an expired token comes back as a 401 that is
 * a retry rather than a failure. These pin all of that against the published
 * contract, without sending anything (units are prepaid and real).
 */
function mockFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift() ?? { status: 200, body: {} };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const TOKEN_RESPONSE = { status: 200, body: { access_token: 'token-abc', expires_in: 3600 } };
const SEND_RESPONSE = {
  status: 201,
  body: {
    outboundSMSMessageRequest: {
      resourceURL:
        'https://api.orange.com/smsmessaging/v1/outbound/tel:+2370000/requests/abc12345-1111-2222-3333-444455556666',
    },
  },
};

describe('Orange SMS provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('needs both credentials before it claims to be configured', () => {
    const provider = new OrangeSmsProvider();
    const original = { ...orangeConfig };
    orangeConfig.clientId = '';
    orangeConfig.clientSecret = '';
    expect(provider.isConfigured()).toBe(false);
    orangeConfig.clientId = 'id';
    expect(provider.isConfigured()).toBe(false); // secret still missing
    orangeConfig.clientSecret = 'secret';
    expect(provider.isConfigured()).toBe(true);
    Object.assign(orangeConfig, original);
  });

  it('sends the shape Orange documents, and returns the message id', async () => {
    const calls = mockFetch([TOKEN_RESPONSE, SEND_RESPONSE]);
    Object.assign(orangeConfig, {
      clientId: 'id',
      clientSecret: 'secret',
      senderAddress: 'tel:+2370000',
      senderName: '',
      onNetOnly: false,
    });

    const result = await new OrangeSmsProvider().send('+237650035675', 'Your code is 123456');

    // 1) Token: client_credentials with HTTP basic.
    expect(calls[0].url).toBe('https://api.orange.com/oauth/v3/token');
    expect(calls[0].init.body).toBe('grant_type=client_credentials');
    expect(String((calls[0].init.headers as Record<string, string>).Authorization)).toMatch(/^Basic /);

    // 2) Send: short code URL-encoded in the path, bearer token, JSON body.
    expect(calls[1].url).toBe(
      'https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2370000/requests',
    );
    const body = JSON.parse(String(calls[1].init.body));
    expect(body.outboundSMSMessageRequest.address).toBe('tel:+237650035675');
    expect(body.outboundSMSMessageRequest.senderAddress).toBe('tel:+2370000');
    expect(body.outboundSMSMessageRequest.outboundSMSTextMessage.message).toBe('Your code is 123456');

    expect(result).toEqual({ id: 'abc12345-1111-2222-3333-444455556666', provider: 'orange' });
  });

  it('asks for a delivery receipt, the only way to learn a send was dropped', async () => {
    const calls = mockFetch([TOKEN_RESPONSE, SEND_RESPONSE]);
    Object.assign(orangeConfig, {
      clientId: 'id',
      clientSecret: 'secret',
      receiptUrl: 'https://api.bizik.cm/api/v1/sms/webhooks/orange/dr',
    });

    await new OrangeSmsProvider().send('+237650035675', 'hello');

    const sent = JSON.parse(String(calls[1].init.body)).outboundSMSMessageRequest;
    expect(sent.receiptRequest.notifyURL).toBe(
      'https://api.bizik.cm/api/v1/sms/webhooks/orange/dr',
    );
    Object.assign(orangeConfig, { receiptUrl: '' });
  });

  it('omits the receipt request when no URL is reachable, e.g. locally', async () => {
    const calls = mockFetch([TOKEN_RESPONSE, SEND_RESPONSE]);
    Object.assign(orangeConfig, { clientId: 'id', clientSecret: 'secret', receiptUrl: '' });

    await new OrangeSmsProvider().send('+237650035675', 'hello');

    expect(
      JSON.parse(String(calls[1].init.body)).outboundSMSMessageRequest,
    ).not.toHaveProperty('receiptRequest');
  });

  it('omits senderName entirely when none is whitelisted', async () => {
    const calls = mockFetch([TOKEN_RESPONSE, SEND_RESPONSE]);
    Object.assign(orangeConfig, { clientId: 'id', clientSecret: 'secret', senderName: '' });

    await new OrangeSmsProvider().send('+237650035675', 'hello');

    // Sending an unapproved sender name is a 400 from Orange, so the key must
    // be absent rather than empty.
    expect(JSON.parse(String(calls[1].init.body)).outboundSMSMessageRequest).not.toHaveProperty(
      'senderName',
    );
  });

  it('includes senderName once one is configured', async () => {
    const calls = mockFetch([TOKEN_RESPONSE, SEND_RESPONSE]);
    Object.assign(orangeConfig, { clientId: 'id', clientSecret: 'secret', senderName: 'BIZIK' });

    await new OrangeSmsProvider().send('+237650035675', 'hello');

    expect(JSON.parse(String(calls[1].init.body)).outboundSMSMessageRequest.senderName).toBe('BIZIK');
    Object.assign(orangeConfig, { senderName: '' });
  });

  it('reuses one token across sends instead of minting per message', async () => {
    const calls = mockFetch([TOKEN_RESPONSE, SEND_RESPONSE, SEND_RESPONSE]);
    Object.assign(orangeConfig, { clientId: 'id', clientSecret: 'secret' });

    const provider = new OrangeSmsProvider();
    await provider.send('+237650035675', 'one');
    await provider.send('+237650035676', 'two');

    expect(calls.filter((call) => call.url.includes('/oauth/v3/token'))).toHaveLength(1);
  });

  it('refreshes the token and retries once on an expired-credentials 401', async () => {
    const calls = mockFetch([
      TOKEN_RESPONSE,
      { status: 401, body: { code: 42, message: 'Expired credentials' } },
      TOKEN_RESPONSE,
      SEND_RESPONSE,
    ]);
    Object.assign(orangeConfig, { clientId: 'id', clientSecret: 'secret' });

    const result = await new OrangeSmsProvider().send('+237650035675', 'hello');

    expect(result.provider).toBe('orange');
    expect(calls.filter((call) => call.url.includes('/oauth/v3/token'))).toHaveLength(2);
  });

  it('surfaces the provider error text rather than a bare status', async () => {
    mockFetch([
      TOKEN_RESPONSE,
      {
        status: 400,
        body: { requestError: { serviceException: { text: 'Sender name not whitelisted' } } },
      },
    ]);
    Object.assign(orangeConfig, { clientId: 'id', clientSecret: 'secret' });

    await expect(new OrangeSmsProvider().send('+237650035675', 'hello')).rejects.toThrow(
      /Sender name not whitelisted/,
    );
  });

  it('reads the remaining bundle, which is what stops sending when it runs out', async () => {
    mockFetch([
      TOKEN_RESPONSE,
      {
        status: 200,
        body: [
          {
            country: 'CMR',
            offerName: 'SMS_OCB',
            availableUnits: 100,
            status: 'ACTIVE',
            expirationDate: '2026-10-29T23:59:00.000Z',
          },
        ],
      },
    ]);
    Object.assign(orangeConfig, { clientId: 'id', clientSecret: 'secret' });

    const contracts = await new OrangeSmsProvider().balance();
    expect(contracts).toEqual([
      {
        country: 'CMR',
        offerName: 'SMS_OCB',
        availableUnits: 100,
        status: 'ACTIVE',
        expirationDate: '2026-10-29T23:59:00.000Z',
      },
    ]);
  });
});
