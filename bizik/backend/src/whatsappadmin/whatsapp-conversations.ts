import crypto from 'crypto';

import { Prisma } from '@prisma/client';

import { config } from '../config/env';
import { prisma } from '../lib/prisma';

/**
 * The WhatsApp channel as CONVERSATIONS rather than one flat feed.
 *
 * The console used to show the newest 50 messages from everyone interleaved,
 * which is unreadable the moment more than one person is talking: an operator
 * answering a question has to reconstruct who said what. Here the unit is a
 * contact - their thread, their state, their history - and the list is
 * searchable and filterable so the page stays small however busy the channel is.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A stable, opaque id for a conversation.
 *
 * Phone numbers are the identity of everyone on this platform, so they do not
 * belong in URLs, browser history or proxy logs. This is an HMAC keyed with the
 * app's own secret: the same number always maps to the same id (so a selected
 * thread survives a list refresh), and the id cannot be turned back into a
 * number by anyone who obtains it.
 */
const ID_KEY = crypto.createHash('sha256').update(`wa-conv:${config.jwt.accessSecret}`).digest();

export function conversationId(phone: string): string {
  return crypto.createHmac('sha256', ID_KEY).update(phone).digest('hex').slice(0, 32);
}

/** Last four digits only - enough to correlate a chat, not a directory. */
export function maskPhone(phone: string): string {
  return `•••${phone.slice(-4)}`;
}

export type ConversationFilter = 'all' | 'guests' | 'linked' | 'locked' | 'optedOut' | 'reachable';

export interface ConversationSummary {
  id: string;
  phone: string;
  user: { id: string; name: string; username: string | null } | null;
  linked: boolean;
  optIn: boolean;
  locked: boolean;
  hasPin: boolean;
  /** Inside Meta's 24-hour window, so a free-form reply can still be delivered. */
  reachable: boolean;
  messages: { total: number; inbound: number; outbound: number };
  lastMessage: { direction: string; kind: string; preview: string | null; createdAt: Date } | null;
  firstMessageAt: Date | null;
  lastInboundAt: Date | null;
}

/** One line of a message, trimmed for the list. */
function preview(body: string | null, kind: string): string | null {
  if (!body) return `(${kind})`;
  const single = body.replace(/\s+/g, ' ').trim();
  return single.length > 120 ? `${single.slice(0, 119)}…` : single;
}

/**
 * Resolve an opaque conversation id back to its phone number.
 *
 * The id is a one-way HMAC, so this matches it against the numbers that have
 * actually messaged us rather than reversing it. That keeps the id opaque at
 * the cost of one aggregate query, which is the right trade for a console page.
 */
export async function phoneForConversation(id: string): Promise<string | null> {
  const phones = await prisma.whatsAppMessage.groupBy({ by: ['phone'] });
  const match = phones.find((row) => conversationId(row.phone) === id);
  return match?.phone ?? null;
}

/** Conversations, newest activity first, with the filters an operator needs. */
export async function listConversations(options: {
  search?: string;
  filter?: ConversationFilter;
  limit?: number;
  offset?: number;
}): Promise<{ conversations: ConversationSummary[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const search = options.search?.trim() ?? '';
  const filter = options.filter ?? 'all';

  // A search can match a number's last digits or the linked account's name, so
  // resolve matching users first and search messages on either.
  let userIdsMatchingSearch: string[] = [];
  if (search) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 200,
    });
    userIdsMatchingSearch = users.map((user) => user.id);
  }

  const where: Prisma.WhatsAppMessageWhereInput = search
    ? {
        OR: [
          { phone: { contains: search.replace(/\D/g, '') || search } },
          ...(userIdsMatchingSearch.length ? [{ userId: { in: userIdsMatchingSearch } }] : []),
        ],
      }
    : {};

  // One row per phone, ordered by the most recent message.
  const grouped = await prisma.whatsAppMessage.groupBy({
    by: ['phone'],
    where,
    _count: { _all: true },
    _max: { createdAt: true },
    _min: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
  });

  const phones = grouped.map((row) => row.phone);
  const [channels, inboundCounts, lastMessages] = await Promise.all([
    prisma.whatsAppChannel.findMany({ where: { phone: { in: phones } } }),
    prisma.whatsAppMessage.groupBy({
      by: ['phone'],
      where: { phone: { in: phones }, direction: 'INBOUND' },
      _count: { _all: true },
    }),
    // The newest message of EACH conversation. A plain "newest N messages"
    // query silently loses the preview for any contact whose last message is
    // older than that window, so this asks Postgres for one row per phone.
    phones.length
      ? prisma.$queryRaw<
          {
            phone: string;
            direction: string;
            kind: string;
            body: string | null;
            createdAt: Date;
            userId: string | null;
          }[]
        >`
          SELECT DISTINCT ON (phone) phone, direction::text, kind, body, "createdAt", "userId"
          FROM whatsapp_messages
          WHERE phone IN (${Prisma.join(phones)})
          ORDER BY phone, "createdAt" DESC
        `
      : Promise.resolve([]),
  ]);

  const channelByPhone = new Map(channels.map((channel) => [channel.phone, channel]));
  const inboundByPhone = new Map(inboundCounts.map((row) => [row.phone, row._count._all]));
  const latestByPhone = new Map<string, (typeof lastMessages)[number]>();
  const userIdByPhone = new Map<string, string>();
  for (const message of lastMessages) {
    latestByPhone.set(message.phone, message);
    if (message.userId && !userIdByPhone.has(message.phone)) userIdByPhone.set(message.phone, message.userId);
  }
  // A conversation can start before onboarding, so the newest message may carry
  // no user even though an earlier one does. Fill those in.
  const missingUser = phones.filter((phone) => !userIdByPhone.has(phone));
  if (missingUser.length) {
    const linked = await prisma.whatsAppMessage.findMany({
      where: { phone: { in: missingUser }, userId: { not: null } },
      distinct: ['phone'],
      select: { phone: true, userId: true },
    });
    for (const row of linked) {
      if (row.userId) userIdByPhone.set(row.phone, row.userId);
    }
  }

  // A number can be linked through its channel row or through a message.
  for (const channel of channels) {
    if (!userIdByPhone.has(channel.phone)) userIdByPhone.set(channel.phone, channel.userId);
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIdByPhone.values())] } },
    select: { id: true, fullName: true, username: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));

  const now = Date.now();
  const all: ConversationSummary[] = grouped.map((row) => {
    const channel = channelByPhone.get(row.phone);
    const userId = userIdByPhone.get(row.phone);
    const user = userId ? userById.get(userId) : undefined;
    const total = row._count._all;
    const inbound = inboundByPhone.get(row.phone) ?? 0;
    const latest = latestByPhone.get(row.phone);
    const lastInboundAt = channel?.lastInboundAt ?? null;
    return {
      id: conversationId(row.phone),
      phone: maskPhone(row.phone),
      user: user ? { id: user.id, name: user.fullName, username: user.username } : null,
      linked: !!channel,
      optIn: channel?.optIn ?? true,
      locked: channel?.locked ?? false,
      hasPin: !!channel?.pinHash,
      reachable: !!lastInboundAt && now - lastInboundAt.getTime() < DAY_MS,
      messages: { total, inbound, outbound: total - inbound },
      lastMessage: latest
        ? {
            direction: latest.direction,
            kind: latest.kind,
            preview: preview(latest.body, latest.kind),
            createdAt: latest.createdAt,
          }
        : null,
      firstMessageAt: row._min.createdAt,
      lastInboundAt,
    };
  });

  // Filters read the joined state, so they are applied after assembly.
  const filtered = all.filter((conversation) => {
    switch (filter) {
      case 'guests':
        return !conversation.user;
      case 'linked':
        return !!conversation.user;
      case 'locked':
        return conversation.locked;
      case 'optedOut':
        return !conversation.optIn;
      case 'reachable':
        return conversation.reachable;
      default:
        return true;
    }
  });

  return { conversations: filtered.slice(offset, offset + limit), total: filtered.length };
}

/** One conversation's thread, oldest first, newest page by default. */
export async function conversationThread(
  id: string,
  options: { limit?: number; before?: Date } = {},
): Promise<{
  conversation: ConversationSummary | null;
  messages: { id: string; direction: string; kind: string; body: string | null; createdAt: Date }[];
  hasMore: boolean;
}> {
  const phone = await phoneForConversation(id);
  if (!phone) return { conversation: null, messages: [], hasMore: false };

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = await prisma.whatsAppMessage.findMany({
    where: { phone, ...(options.before ? { createdAt: { lt: options.before } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: { id: true, direction: true, kind: true, body: true, createdAt: true },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // The summary for the header comes from the same builder as the list, so the
  // two can never disagree about who this is.
  const { conversations } = await listConversations({ search: phone.slice(-4), limit: 100 });
  const conversation = conversations.find((entry) => entry.id === id) ?? null;

  return { conversation, messages: page.reverse(), hasMore };
}
