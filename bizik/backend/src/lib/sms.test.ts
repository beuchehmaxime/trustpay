import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '../config/env';
import { orangeSms, sendSmsMessage, smsProviderStatus, twilioSms } from './sms';

/** `config` is readonly by design; tests need to vary the preference. */
const mutableConfig = config as { smsProvider: string };

/**
 * Which rail carries a message, and what happens when one fails.
 *
 * Cameroon numbers go through Orange (local short code, every local operator,
 * FCFA bundles); everything else through Twilio. Either can stand in for the
 * other, because a code that is not delivered is a user who cannot sign in.
 */
describe('SMS routing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mutableConfig.smsProvider = 'auto';
  });

  function stub(options: { orange: boolean; twilio: boolean }) {
    vi.spyOn(orangeSms, 'isConfigured').mockReturnValue(options.orange);
    vi.spyOn(twilioSms, 'isConfigured').mockReturnValue(options.twilio);
    const orangeSend = vi
      .spyOn(orangeSms, 'send')
      .mockResolvedValue({ id: 'o1', provider: 'orange' });
    const twilioSend = vi
      .spyOn(twilioSms, 'send')
      .mockResolvedValue({ id: 't1', provider: 'twilio' });
    return { orangeSend, twilioSend };
  }

  it('sends Cameroon numbers through Orange', async () => {
    const { orangeSend, twilioSend } = stub({ orange: true, twilio: true });
    await sendSmsMessage('+237650035675', 'code');
    expect(orangeSend).toHaveBeenCalledOnce();
    expect(twilioSend).not.toHaveBeenCalled();
  });

  it('sends numbers outside Cameroon through Twilio', async () => {
    const { orangeSend, twilioSend } = stub({ orange: true, twilio: true });
    await sendSmsMessage('+2348012345678', 'code');
    expect(twilioSend).toHaveBeenCalledOnce();
    expect(orangeSend).not.toHaveBeenCalled();
  });

  it('falls back to the other rail when the first one fails', async () => {
    const { orangeSend, twilioSend } = stub({ orange: true, twilio: true });
    orangeSend.mockRejectedValueOnce(new Error('bundle empty'));
    await sendSmsMessage('+237650035675', 'code');
    expect(orangeSend).toHaveBeenCalledOnce();
    expect(twilioSend).toHaveBeenCalledOnce();
  });

  it('uses whichever rail is configured when the preferred one is not', async () => {
    const { orangeSend, twilioSend } = stub({ orange: false, twilio: true });
    await sendSmsMessage('+237650035675', 'code');
    expect(orangeSend).not.toHaveBeenCalled();
    expect(twilioSend).toHaveBeenCalledOnce();
  });

  it('honours an explicit SMS_PROVIDER preference', async () => {
    const { orangeSend, twilioSend } = stub({ orange: true, twilio: true });
    mutableConfig.smsProvider = 'twilio';
    await sendSmsMessage('+237650035675', 'code');
    expect(twilioSend).toHaveBeenCalledOnce();
    expect(orangeSend).not.toHaveBeenCalled();
  });

  it('never throws when nothing is configured, so a send cannot break a request', async () => {
    stub({ orange: false, twilio: false });
    await expect(sendSmsMessage('+237650035675', 'code')).resolves.toBeUndefined();
  });

  it('never throws when every rail fails', async () => {
    const { orangeSend, twilioSend } = stub({ orange: true, twilio: true });
    orangeSend.mockRejectedValue(new Error('down'));
    twilioSend.mockRejectedValue(new Error('also down'));
    await expect(sendSmsMessage('+237650035675', 'code')).resolves.toBeUndefined();
  });

  it('reports rail status for the startup banner', () => {
    stub({ orange: true, twilio: false });
    expect(smsProviderStatus()).toEqual([
      { name: 'orange', configured: true, preferred: true },
      { name: 'twilio', configured: false, preferred: false },
    ]);
  });
});
