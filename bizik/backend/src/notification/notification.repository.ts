import { DevicePlatform, NotificationCategory, NotificationChannel, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { sendExpoPush } from '../lib/push';
import { emitToUser } from '../lib/realtime';

export const NotificationRepository = {
  async create(data: Prisma.NotificationUncheckedCreateInput) {
    const notification = await prisma.notification.create({ data });
    // Push it live to any connected client so the inbox/unread badge updates
    // without waiting for the next poll…
    emitToUser(notification.userId, 'notification:new', {
      id: notification.id,
      category: notification.category,
      title: notification.title,
    });
    // …and send a device push (fire-and-forget) to the user's registered tokens.
    void this.pushToDevices(notification.userId, notification.title, notification.body, {
      notificationId: notification.id,
      category: notification.category,
    });
    return notification;
  },

  async pushToDevices(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const tokens = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
    if (tokens.length === 0) return;
    await sendExpoPush(
      tokens.map((row) => ({ to: row.token, title, body, data, sound: 'default' as const })),
    );
  },

  markRead(userId: string, id: string) {
    return prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  },

  markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  },

  unreadCount(userId: string) {
    return prisma.notification.count({ where: { userId, readAt: null } });
  },

  getPreferences(userId: string) {
    return prisma.notificationPreference.findMany({ where: { userId } });
  },

  upsertPreference(
    userId: string,
    category: NotificationCategory,
    channel: NotificationChannel,
    enabled: boolean,
  ) {
    return prisma.notificationPreference.upsert({
      where: { userId_category_channel: { userId, category, channel } },
      update: { enabled },
      create: { userId, category, channel, enabled },
    });
  },

  registerPushToken(userId: string, token: string, platform: DevicePlatform) {
    return prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
  },

  listNotifications(userId: string, take = 50) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },
};
