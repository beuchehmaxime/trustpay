import { WhatsAppDirection } from '@prisma/client';

import { config } from '../config/env';
import { prisma } from '../lib/prisma';
import { systemSettings } from '../lib/system-settings';

/**
 * Operator visibility for the WhatsApp channel.
 *
 * WhatsApp now carries real money - deals, transfers, deposits, withdrawals -
 * and until now the console could see none of it: no volume, no failures, and
 * no way to stop the channel without an environment change and a redeploy. This
 * is the read-only view plus the one control that matters, the kill switch.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Outbound rows we write only on a confirmed send, so these are deliveries. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const WhatsAppAdminService = {
  /** Headline numbers plus a 14-day volume series for the console. */
  async overview(days = 14) {
    const since = new Date(Date.now() - days * DAY_MS);

    const [messages, channels, lockedCount, optedOutCount, withPin] = await Promise.all([
      prisma.whatsAppMessage.findMany({
        where: { createdAt: { gte: since } },
        select: { direction: true, kind: true, createdAt: true, phone: true },
      }),
      prisma.whatsAppChannel.count(),
      prisma.whatsAppChannel.count({ where: { locked: true } }),
      prisma.whatsAppChannel.count({ where: { optIn: false } }),
      prisma.whatsAppChannel.count({ where: { NOT: { pinHash: null } } }),
    ]);

    // Volume per day, split by direction - the shape an operator reads at a glance.
    const byDay = new Map<string, { date: string; inbound: number; outbound: number }>();
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = dayKey(new Date(Date.now() - offset * DAY_MS));
      byDay.set(date, { date, inbound: 0, outbound: 0 });
    }
    for (const message of messages) {
      const bucket = byDay.get(dayKey(message.createdAt));
      if (!bucket) continue;
      if (message.direction === WhatsAppDirection.INBOUND) bucket.inbound += 1;
      else bucket.outbound += 1;
    }

    const inbound = messages.filter((message) => message.direction === 'INBOUND').length;
    const outbound = messages.length - inbound;
    const activeNumbers = new Set(messages.map((message) => message.phone)).size;

    // How many of the linked numbers can still be reached without a template.
    const reachable = await prisma.whatsAppChannel.count({
      where: { optIn: true, locked: false, lastInboundAt: { gte: new Date(Date.now() - DAY_MS) } },
    });

    return {
      enabled: this.channelEnabled(),
      envEnabled: config.whatsapp.enabled,
      settingEnabled: systemSettings().general.whatsappEnabled !== false,
      windowDays: days,
      totals: { inbound, outbound, activeNumbers },
      channels: {
        linked: channels,
        locked: lockedCount,
        optedOut: optedOutCount,
        withPin,
        /** Inside Meta's 24-hour window, so free-form messages can reach them. */
        reachableNow: reachable,
      },
      series: [...byDay.values()],
    };
  },

  /**
   * The most recent conversations, newest first - enough for an operator to see
   * what the assistant is actually saying without opening a database client.
   */
  async recent(limit = 50) {
    const rows = await prisma.whatsAppMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        phone: true,
        userId: true,
        direction: true,
        kind: true,
        body: true,
        createdAt: true,
      },
    });

    const userIds = [...new Set(rows.map((row) => row.userId).filter(Boolean))] as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, username: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    return rows.map((row) => ({
      id: row.id,
      // Only the last 4 digits: an operator needs to correlate a conversation,
      // not to read a directory of everyone's phone number.
      phone: `•••${row.phone.slice(-4)}`,
      user: row.userId
        ? { name: byId.get(row.userId)?.fullName ?? null, username: byId.get(row.userId)?.username ?? null }
        : null,
      direction: row.direction,
      kind: row.kind,
      body: row.body,
      createdAt: row.createdAt,
    }));
  },

  /** Is the channel live right now? Both the env and the runtime switch must allow it. */
  channelEnabled(): boolean {
    return config.whatsapp.enabled && systemSettings().general.whatsappEnabled !== false;
  },
};
