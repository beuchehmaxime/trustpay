import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The outbound door.
 *
 * These are not tests of the Meta API - they are tests of what we are willing
 * to send it. The guard lives in `complete()` precisely so there is one place
 * to assert against, and the first test here is the one that matters: a call
 * site that forgets to scrub must be refused, not quietly honoured.
 */

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Static imports, not `await import(...)`. Top-level await does not compile
// under the CommonJS target the production build uses, and `complete()` reads
// `fetch` at call time rather than import time, so stubbing above is enough.
import { complete, PiiLeakError } from './client';
import { config } from '../config/env';

// `config` is frozen as const but its fields are plain values at runtime.
const meta = config.meta as { apiKey: string; baseUrl: string; sparkModel: string };

function respondWith(content: string, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    }),
    text: async () => content,
  });
}

describe('what we refuse to send', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    meta.apiKey = 'test-key';
  });

  it('REFUSES a message that still contains a phone number', async () => {
    // The whole reason the guard is here and not at each call site: this is a
    // caller who forgot to scrub, and it must not reach the network.
    await expect(
      complete([{ role: 'user', content: 'the buyer is on 677123456' }]),
    ).rejects.toBeInstanceOf(PiiLeakError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('REFUSES an email address too', async () => {
    await expect(
      complete([{ role: 'user', content: 'mail paul@example.cm about it' }]),
    ).rejects.toThrow(/identifying data/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks EVERY message, not just the first', async () => {
    // A system prompt is clean and the evidence is not - the common shape.
    await expect(
      complete([
        { role: 'system', content: 'You are a mediator.' },
        { role: 'user', content: 'reach them on +237 677 12 34 56' },
      ]),
    ).rejects.toBeInstanceOf(PiiLeakError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a properly scrubbed message', async () => {
    respondWith('understood');
    const result = await complete([
      { role: 'user', content: 'PARTY_A was reached on [PHONE_1] about 250000 FCFA' },
    ]);
    expect(result.text).toBe('understood');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('refuses before it even looks for a key, so a leak cannot hide behind config', async () => {
    meta.apiKey = '';
    await expect(complete([{ role: 'user', content: 'call 677123456' }])).rejects.toBeInstanceOf(
      PiiLeakError,
    );
  });
});

describe('failing in a way the escalation policy can use', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    meta.apiKey = 'test-key';
  });

  it('says plainly when no key is configured, rather than failing obscurely', async () => {
    meta.apiKey = '';
    await expect(complete([{ role: 'user', content: 'hello' }])).rejects.toThrow(/MODEL_API_KEY/);
  });

  it('gives a timeout its own code, because a timeout means escalate', async () => {
    // A model that does not answer is not a model that said "split it 50/50".
    // The only safe reading is "hand this to a human", so the policy needs to
    // be able to tell a timeout apart from a refusal.
    fetchMock.mockImplementationOnce(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });
    await expect(
      complete([{ role: 'user', content: 'hello' }], { timeoutMs: 5 }),
    ).rejects.toThrow(/did not answer in time/i);
  });

  it('passes a rate limit through as 429 so a retry can be paced', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
      json: async () => ({}),
    });
    await expect(complete([{ role: 'user', content: 'hello' }])).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it('truncates the upstream error body, which can echo the evidence back', async () => {
    const echoed = 'x'.repeat(5000);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => echoed,
      json: async () => ({}),
    });
    try {
      await complete([{ role: 'user', content: 'hello' }]);
      throw new Error('should have thrown');
    } catch (error) {
      const details = (error as { details?: { hint?: string } }).details;
      expect(details?.hint?.length).toBeLessThanOrEqual(200);
    }
  });

  it('does not retry on its own - a $150 budget is not the place for silent doubles', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'boom',
      json: async () => ({}),
    });
    await expect(complete([{ role: 'user', content: 'hello' }])).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('the request it actually builds', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    meta.apiKey = 'test-key';
  });

  afterEach(() => {
    meta.sparkModel = 'muse-spark-1.3';
  });

  it('sends the pinned model, not whatever the API would default to', async () => {
    // The docs list 1.3, 1.2 and 1.1 and at least one client defaults to 1.1.
    respondWith('ok');
    await complete([{ role: 'user', content: 'hello' }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('muse-spark-1.3');
  });

  it('lets a caller override the model per call', async () => {
    respondWith('ok');
    await complete([{ role: 'user', content: 'hello' }], { model: 'muse-wonder-1.0' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('muse-wonder-1.0');
  });

  it('authenticates with a bearer token', async () => {
    respondWith('ok');
    await complete([{ role: 'user', content: 'hello' }]);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
  });

  it('asks for JSON back when the caller needs a structured verdict', async () => {
    respondWith('{}');
    await complete([{ role: 'user', content: 'hello' }], { json: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('defaults to a low temperature, because this is adjudication not prose', async () => {
    respondWith('ok');
    await complete([{ role: 'user', content: 'hello' }]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).temperature).toBe(0.2);
  });
});
