import bcrypt from 'bcryptjs';

import { config } from '../config/env';
import { WhatsAppRepository } from './whatsapp.repository';

/**
 * Transaction-PIN handling for the WhatsApp channel. Number control is the first
 * factor (WhatsApp verifies the sender); the PIN is the step-up second factor
 * for money actions. PINs are stored bcrypt-hashed, never logged in clear.
 */

const PIN_RE = /^\d{4,6}$/;
const MAX_PIN_FAILURES = 5;

export const WhatsAppSecurity = {
  isValidPinFormat(pin: string): boolean {
    return PIN_RE.test(pin.trim());
  },

  async hasPin(userId: string): Promise<boolean> {
    const channel = await WhatsAppRepository.getChannelByUser(userId);
    return !!channel?.pinHash;
  },

  async setPin(userId: string, pin: string): Promise<void> {
    const hash = await bcrypt.hash(pin.trim(), config.bcryptRounds);
    await WhatsAppRepository.setPinHash(userId, hash);
  },

  /**
   * Verify a PIN. Returns 'ok', 'wrong' (with attempts left), or 'locked' once
   * too many wrong tries accumulate (the account is frozen from WhatsApp money
   * actions until an operator/app reset).
   */
  async verifyPin(userId: string, pin: string): Promise<{ result: 'ok' | 'wrong' | 'locked'; left?: number }> {
    const channel = await WhatsAppRepository.getChannelByUser(userId);
    if (!channel?.pinHash) return { result: 'wrong', left: MAX_PIN_FAILURES };
    if (channel.pinFailures >= MAX_PIN_FAILURES || channel.locked) return { result: 'locked' };

    const ok = await bcrypt.compare(pin.trim(), channel.pinHash);
    if (ok) {
      if (channel.pinFailures > 0) await WhatsAppRepository.resetPinFailures(userId);
      return { result: 'ok' };
    }
    const updated = await WhatsAppRepository.bumpPinFailures(userId);
    if (updated.pinFailures >= MAX_PIN_FAILURES) {
      await WhatsAppRepository.setLocked(userId, true);
      return { result: 'locked' };
    }
    return { result: 'wrong', left: MAX_PIN_FAILURES - updated.pinFailures };
  },
};
