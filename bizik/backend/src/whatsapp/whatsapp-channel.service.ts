import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { WhatsAppRepository } from './whatsapp.repository';

/**
 * The account owner's own controls over their WhatsApp channel, exposed to the
 * app (Settings → Security). The chat itself can only ever LOCK the channel -
 * unlocking is deliberately app-only, because a locked channel means the number
 * may be in someone else's hands, and the app requires the account password.
 */
export const WhatsAppChannelService = {
  /** What the app shows: is the channel linked, on, locked, PIN-protected? */
  async status(userId: string) {
    const channel = await WhatsAppRepository.getChannelByUser(userId);
    if (!channel) {
      return { linked: false, phone: null, optIn: false, locked: false, hasPin: false, lockedOut: false };
    }
    return {
      linked: true,
      phone: channel.phone,
      optIn: channel.optIn,
      locked: channel.locked,
      hasPin: !!channel.pinHash,
      /** True when wrong-PIN attempts have already frozen money actions. */
      lockedOut: channel.pinFailures >= 5,
    };
  },

  /** Freeze the channel from the app (mirrors typing LOCK in the chat). */
  async lock(userId: string) {
    await this.requireChannel(userId);
    await WhatsAppRepository.setLocked(userId, true);
    return this.status(userId);
  },

  /**
   * Release the lock AND any wrong-PIN lockout. This is the only way back in -
   * the chat can never unlock itself.
   */
  async unlock(userId: string) {
    await this.requireChannel(userId);
    await prisma.whatsAppChannel.update({
      where: { userId },
      data: { locked: false, pinFailures: 0 },
    });
    return this.status(userId);
  },

  /**
   * Forget the transaction PIN so the next money action asks the owner to set a
   * new one. Used when the PIN is forgotten or possibly known to someone else.
   */
  async resetPin(userId: string) {
    await this.requireChannel(userId);
    await prisma.whatsAppChannel.update({
      where: { userId },
      data: { pinHash: null, pinFailures: 0 },
    });
    return this.status(userId);
  },

  /** Turn proactive WhatsApp messages on/off (same switch as replying STOP). */
  async setOptIn(userId: string, optIn: boolean) {
    await this.requireChannel(userId);
    await WhatsAppRepository.setOptIn(userId, optIn);
    return this.status(userId);
  },

  async requireChannel(userId: string) {
    const channel = await WhatsAppRepository.getChannelByUser(userId);
    if (!channel) {
      throw new AppError(404, 'Q-404', 'You have not used BiZik on WhatsApp yet.');
    }
    return channel;
  },
};
