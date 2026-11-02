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
vi.mock('./sms', () => ({
  sendSmsMessage: (...args: unknown[]) => sendSmsMessage(...args),
}));

/** `config` is readonly by design; these tests need to vary the channel. */
const whatsappConfig = config.whatsapp as {
  enabled: boolean;
  otpTemplate: string;
  otpTemplateLanguage: string;
  otpTemplateLanguageFr: string;
  otpProvider: 'meta';
};

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
  });
});
