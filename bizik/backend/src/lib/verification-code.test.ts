import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '../config/env';

/**
 * WhatsApp first, SMS second - and specifically what counts as "first worked".
 *
 * Both WhatsApp clients REPORT a rejection (`{ ok: false }`) instead of
 * throwing, so an implementation that only catches exceptions treats every
 * undelivered code as delivered and never falls back. That was a real bug on the
 * Meta path; these tests keep it fixed on both.
 */

const sendTemplate = vi.fn();
const sendText = vi.fn();
const sendSmsMessage = vi.fn();

vi.mock('../whatsapp/whatsapp-client', () => ({
  WhatsAppClient: { sendTemplate: (...args: unknown[]) => sendTemplate(...args) },
}));
vi.mock('../whatsapp/wasender-client', () => ({
  WasenderClient: { sendText: (...args: unknown[]) => sendText(...args) },
}));
vi.mock('./sms', () => ({
  sendSmsMessage: (...args: unknown[]) => sendSmsMessage(...args),
}));

/** `config` is readonly by design; these tests need to vary the channel. */
const whatsappConfig = config.whatsapp as {
  enabled: boolean;
  otpTemplate: string;
  otpTemplateLanguage: string;
  otpTemplateLanguageFr: string;
  otpProvider: 'meta' | 'wasender';
};
const wasenderConfig = config.wasender as { apiKey: string };

async function load() {
  return import('./verification-code');
}

describe('verification code delivery', () => {
  beforeEach(() => {
    sendTemplate.mockReset();
    sendText.mockReset();
    sendSmsMessage.mockReset().mockResolvedValue(undefined);
    whatsappConfig.enabled = true;
    whatsappConfig.otpTemplate = 'bizik_code';
    whatsappConfig.otpTemplateLanguage = 'en';
    whatsappConfig.otpTemplateLanguageFr = 'fr';
    whatsappConfig.otpProvider = 'meta';
    wasenderConfig.apiKey = '';
  });

  describe('WasenderAPI route', () => {
    beforeEach(() => {
      whatsappConfig.otpProvider = 'wasender';
      wasenderConfig.apiKey = 'wasender-key';
    });

    it('sends the code as plain text and reports which route carried it', async () => {
      sendText.mockResolvedValue({ ok: true, messageId: 100001 });
      const { sendVerificationCode } = await load();

      const delivery = await sendVerificationCode('+237650035675', '123456');

      expect(delivery).toEqual({ channel: 'whatsapp', provider: 'wasender' });
      const [to, text] = sendText.mock.calls[0];
      expect(to).toBe('+237650035675');
      expect(String(text)).toContain('123456');
      expect(sendSmsMessage).not.toHaveBeenCalled();
      // The Meta path must stay untouched while wasender is the live route.
      expect(sendTemplate).not.toHaveBeenCalled();
    });

    it('warns against sharing the code, since free-form text can be forwarded', async () => {
      sendText.mockResolvedValue({ ok: true });
      const { sendVerificationCode } = await load();

      await sendVerificationCode('+237650035675', '123456');

      expect(String(sendText.mock.calls[0][1]).toLowerCase()).toContain('never share');
    });

    it('sends French to a French-speaking user', async () => {
      sendText.mockResolvedValue({ ok: true });
      const { sendVerificationCode } = await load();

      await sendVerificationCode('+237650035675', '123456', { locale: 'fr' });

      expect(String(sendText.mock.calls[0][1])).toContain('code de verification');
    });

    it('sends by SMS when the number has no WhatsApp account', async () => {
      sendText.mockResolvedValue({
        ok: false,
        failure: 'not_on_whatsapp',
        message: 'The provided JID does not exist on WhatsApp.',
      });
      const { sendVerificationCode } = await load();

      const delivery = await sendVerificationCode('+237650035675', '123456');

      expect(delivery.channel).toBe('sms');
      expect(String(sendSmsMessage.mock.calls[0][1])).toContain('123456');
    });

    it.each([
      ['not_connected', 'the linked account dropped'],
      ['rate_limited', 'too many sends for the plan'],
      ['unauthorised', 'bad key or dead subscription'],
      ['invalid', 'malformed request'],
      ['network', 'no answer at all'],
    ])('falls back to SMS when the send is REFUSED with %s', async (failure) => {
      sendText.mockResolvedValue({ ok: false, failure, message: 'nope' });
      const { sendVerificationCode } = await load();

      const delivery = await sendVerificationCode('+237650035675', '123456');

      expect(delivery.channel).toBe('sms');
      expect(sendSmsMessage).toHaveBeenCalledOnce();
      expect(String(sendSmsMessage.mock.calls[0][1])).toContain('123456');
    });

    it('falls back to SMS when the attempt throws', async () => {
      sendText.mockRejectedValue(new Error('socket hang up'));
      const { sendVerificationCode } = await load();

      expect((await sendVerificationCode('+237650035675', '123456')).channel).toBe('sms');
      expect(sendSmsMessage).toHaveBeenCalledOnce();
    });

    it('goes straight to SMS when the provider is selected but has no key', async () => {
      wasenderConfig.apiKey = '';
      const { sendVerificationCode } = await load();

      expect((await sendVerificationCode('+237650035675', '123456')).channel).toBe('sms');
      // No round trip that was always going to be refused, and no silent
      // fall-through to Meta either - the selected route is the only one tried.
      expect(sendText).not.toHaveBeenCalled();
      expect(sendTemplate).not.toHaveBeenCalled();
    });
  });

  describe('Meta Cloud API route', () => {
    it('uses WhatsApp when the template is configured and the send is accepted', async () => {
      sendTemplate.mockResolvedValue({ ok: true, id: 'wamid.1' });
      const { sendVerificationCode } = await load();

      const delivery = await sendVerificationCode('+237650035675', '123456');

      expect(delivery).toEqual({ channel: 'whatsapp', provider: 'meta' });
      expect(sendTemplate).toHaveBeenCalledWith('+237650035675', 'bizik_code', 'en', ['123456']);
      expect(sendSmsMessage).not.toHaveBeenCalled();
    });

    it('falls back to SMS when Meta REJECTS the send without throwing', async () => {
      // 131026 = the number cannot receive WhatsApp messages.
      sendTemplate.mockResolvedValue({ ok: false, errorCode: 131026, errorMessage: 'not a WhatsApp user' });
      const { sendVerificationCode } = await load();

      const delivery = await sendVerificationCode('+237650035675', '123456');

      expect(delivery.channel).toBe('sms');
      expect(sendSmsMessage).toHaveBeenCalledOnce();
      expect(String(sendSmsMessage.mock.calls[0][1])).toContain('123456');
    });

    it('falls back to SMS when the WhatsApp attempt throws', async () => {
      sendTemplate.mockRejectedValue(new Error('network down'));
      const { sendVerificationCode } = await load();

      expect((await sendVerificationCode('+237650035675', '123456')).channel).toBe('sms');
      expect(sendSmsMessage).toHaveBeenCalledOnce();
    });

    it('goes straight to SMS while no template is approved', async () => {
      whatsappConfig.otpTemplate = '';
      const { sendVerificationCode } = await load();

      expect((await sendVerificationCode('+237650035675', '123456')).channel).toBe('sms');
      // No pointless attempt that Meta was always going to refuse.
      expect(sendTemplate).not.toHaveBeenCalled();
    });

    it('goes straight to SMS while the channel is switched off', async () => {
      whatsappConfig.enabled = false;
      const { sendVerificationCode } = await load();

      expect((await sendVerificationCode('+237650035675', '123456')).channel).toBe('sms');
      expect(sendTemplate).not.toHaveBeenCalled();
    });

    it('sends the French template to a French-speaking user', async () => {
      sendTemplate.mockResolvedValue({ ok: true });
      const { sendVerificationCode } = await load();

      await sendVerificationCode('+237650035675', '123456', { locale: 'fr' });

      expect(sendTemplate).toHaveBeenCalledWith('+237650035675', 'bizik_code', 'fr', ['123456']);
    });

    it('is still reachable after wasender has been used, so switching back works', async () => {
      whatsappConfig.otpProvider = 'wasender';
      wasenderConfig.apiKey = 'wasender-key';
      sendText.mockResolvedValue({ ok: true });
      const { sendVerificationCode, whatsappOtpRoute } = await load();
      await sendVerificationCode('+237650035675', '111111');
      expect(whatsappOtpRoute()).toBe('wasender');

      // One variable, nothing else touched.
      whatsappConfig.otpProvider = 'meta';
      sendTemplate.mockResolvedValue({ ok: true });

      expect(whatsappOtpRoute()).toBe('meta');
      expect((await sendVerificationCode('+237650035675', '222222')).provider).toBe('meta');
      expect(sendTemplate).toHaveBeenCalledWith('+237650035675', 'bizik_code', 'en', ['222222']);
    });
  });
});
