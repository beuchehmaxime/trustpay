import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '../config/env';
import { WasenderClient } from './wasender-client';

/**
 * The failure cases, because they are the ones that matter.
 *
 * WasenderAPI reports some refusals with HTTP 200 and `success: false`, and
 * describes the reason in prose rather than with an error code. A client that
 * trusts the status line therefore reads "your session is not connected" as a
 * delivered verification code, and nothing downstream ever falls back to SMS.
 */

const originalFetch = global.fetch;
const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  return Promise.resolve({
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('WasenderClient', () => {
  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
    (config.wasender as { apiKey: string }).apiKey = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('sendText', () => {
    it('reports success and carries back the message id', async () => {
      fetchMock.mockReturnValue(
        reply(200, { success: true, data: { msgId: 100000, jid: '+237650035675', status: 'in_progress' } }),
      );

      const result = await WasenderClient.sendText('+237650035675', 'hello');

      expect(result).toEqual({ ok: true, messageId: 100000 });
    });

    it('sends the number in E.164 exactly as stored, with the leading plus', async () => {
      fetchMock.mockReturnValue(reply(200, { success: true }));

      await WasenderClient.sendText('+237650035675', 'hello');

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe('https://www.wasenderapi.com/api/send-message');
      expect(JSON.parse(init.body)).toEqual({ to: '+237650035675', text: 'hello' });
      expect(init.headers.Authorization).toBe('Bearer test-key');
    });

    it('treats HTTP 200 with success:false as a FAILURE, not a delivery', async () => {
      fetchMock.mockReturnValue(
        reply(200, {
          success: false,
          message: 'Your Whatsapp Session is not connected please connect your session first.',
        }),
      );

      const result = await WasenderClient.sendText('+237650035675', 'hello');

      expect(result.ok).toBe(false);
      expect(result.failure).toBe('not_connected');
    });

    it('recognises a rate limit and keeps the retry delay', async () => {
      fetchMock.mockReturnValue(
        reply(429, {
          message: 'You are on a free trial. You can only send 1 message every 1 minute.',
          retry_after: 60,
        }),
      );

      const result = await WasenderClient.sendText('+237650035675', 'hello');

      expect(result.ok).toBe(false);
      expect(result.failure).toBe('rate_limited');
      expect(result.retryAfterSeconds).toBe(60);
    });

    it('reads a bad key and a dead subscription as the same thing: go look at the account', async () => {
      // This is the VERBATIM body the live API returns for a bad key, captured
      // by probing it - note the lowercase "invalid API key" and the extra
      // `help` field, neither of which matches the documented example.
      fetchMock.mockReturnValueOnce(
        reply(401, {
          success: false,
          message: 'invalid API key',
          help: 'please check your WhatsApp session page for the correct key click on the 🔑 icon',
        }),
      );
      expect((await WasenderClient.sendText('+237650035675', 'x')).failure).toBe('unauthorised');

      fetchMock.mockReturnValueOnce(
        reply(200, { success: false, message: 'Active subscription or trial is required to use the API' }),
      );
      expect((await WasenderClient.sendText('+237650035675', 'x')).failure).toBe('unauthorised');
    });

    it('names "not on WhatsApp" apart from a malformed request, so SMS is the obvious next step', async () => {
      // Verbatim from the live API, probed with a number in the reserved
      // fictional +1 555 01xx range. It arrives as a 422, which without this
      // case would be filed as "malformed request" and send whoever is
      // debugging it looking for a bug in our payload.
      fetchMock.mockReturnValue(
        reply(422, { success: false, message: 'The provided JID does not exist on WhatsApp.' }),
      );

      const result = await WasenderClient.sendText('+15550199999', 'hello');

      expect(result.ok).toBe(false);
      expect(result.failure).toBe('not_on_whatsapp');
    });

    it('reports a validation refusal', async () => {
      fetchMock.mockReturnValue(
        reply(422, { success: false, message: 'Validation failed', errors: { to: ['The to field is required.'] } }),
      );

      expect((await WasenderClient.sendText('+237650035675', 'x')).failure).toBe('invalid');
    });

    it('never throws when the network does', async () => {
      fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await WasenderClient.sendText('+237650035675', 'hello');

      expect(result).toEqual({ ok: false, failure: 'network' });
    });

    it('falls back to `unknown` rather than success when a refusal is reworded', async () => {
      // The reasons are matched on prose, so a wording change must degrade to
      // "something went wrong" and still let the caller reach SMS.
      fetchMock.mockReturnValue(reply(500, { success: false, message: 'something new and unmapped' }));

      const result = await WasenderClient.sendText('+237650035675', 'hello');

      expect(result.ok).toBe(false);
      expect(result.failure).toBe('unknown');
    });

    it('does not call out at all without a key', async () => {
      (config.wasender as { apiKey: string }).apiKey = '';

      expect((await WasenderClient.sendText('+237650035675', 'hello')).failure).toBe('not_configured');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('sessionStatus', () => {
    it('reads the linked account state', async () => {
      fetchMock.mockReturnValue(reply(200, { status: 'connected' }));
      expect(await WasenderClient.sessionStatus()).toBe('connected');

      fetchMock.mockReturnValue(reply(200, { status: 'need_scan' }));
      expect(await WasenderClient.sessionStatus()).toBe('need_scan');
    });

    it('answers `unknown` rather than guessing when the call fails', async () => {
      fetchMock.mockRejectedValue(new Error('down'));
      expect(await WasenderClient.sessionStatus()).toBe('unknown');
    });

    it('answers `unknown` for the live 401 body, not a false "connected"', async () => {
      // Verbatim from the live API with a bad key. There is no `status` field
      // at all, so anything reading one optimistically would report healthy.
      fetchMock.mockReturnValue(
        reply(401, { success: false, message: 'Session not found for the provided API key' }),
      );
      expect(await WasenderClient.sessionStatus()).toBe('unknown');
    });
  });

  describe('isOnWhatsApp', () => {
    it('reports whether the number exists', async () => {
      fetchMock.mockReturnValue(reply(200, { success: true, data: { exists: true } }));
      expect(await WasenderClient.isOnWhatsApp('+237650035675')).toBe(true);
    });

    it('answers null when it cannot tell, so no caller reads it as "not on WhatsApp"', async () => {
      fetchMock.mockReturnValue(reply(200, { success: false, message: 'nope' }));
      expect(await WasenderClient.isOnWhatsApp('+237650035675')).toBeNull();
    });
  });
});
