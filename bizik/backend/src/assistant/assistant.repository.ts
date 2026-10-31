import { prisma } from '../lib/prisma';

/**
 * Where conversations are kept.
 *
 * The split is deliberate. Postgres holds what the user said and what was said
 * back, because that is a record they own and may want weeks later. Redis holds
 * only what is momentary: which conversation is open, a proposal waiting to be
 * approved, and the PIN step-up window. Nothing a user wrote should die with a
 * cache key.
 */

/** How many past messages the model is shown. See `contextFor`. */
const MODEL_CONTEXT_MESSAGES = 16;

/** Longest a generated title may be before it is cut. */
const TITLE_MAX = 60;

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  /** The last thing said, for the list. */
  preview: string;
  lastMessageAt: number;
  messageCount: number;
}

/**
 * Name a conversation after the first thing the user said.
 *
 * Not a model call. Titling every conversation with Muse Spark would spend
 * tokens on something a truncated first line does just as well, and it would
 * make starting a conversation slower for no benefit the user can see.
 */
export function titleFrom(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New chat';
  if (cleaned.length <= TITLE_MAX) return cleaned;
  // Cut on a word boundary where there is one close enough to the limit.
  const cut = cleaned.slice(0, TITLE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > TITLE_MAX - 15 ? cut.slice(0, lastSpace) : cut}...`;
}

export const AssistantRepository = {
  async createConversation(userId: string, title: string): Promise<string> {
    const conversation = await prisma.assistantConversation.create({
      data: { userId, title },
      select: { id: true },
    });
    return conversation.id;
  },

  /**
   * Confirm a conversation belongs to this user.
   *
   * Every read below goes through an ownership check rather than trusting an
   * id from the client. A conversation holds someone's account questions and
   * their side of a dispute; an id that is only hard to guess is not an
   * access control.
   */
  async ownsConversation(userId: string, conversationId: string): Promise<boolean> {
    const found = await prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    return !!found;
  },

  async append(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    if (!content) return;
    await prisma.$transaction([
      prisma.assistantMessage.create({ data: { conversationId, role, content } }),
      prisma.assistantConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  },

  async messages(conversationId: string, limit = 200): Promise<StoredMessage[]> {
    const rows = await prisma.assistantMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { role: true, content: true, createdAt: true },
    });
    return rows.map((row) => ({
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: row.content,
      at: row.createdAt.getTime(),
    }));
  },

  /**
   * The recent tail of a conversation, for the model.
   *
   * Deliberately shorter than what the user is shown. They should be able to
   * scroll back through everything; the model is sent only what it needs to
   * follow the current thread, because every message costs tokens on every
   * turn and an hour-old exchange rarely changes the answer to "what is my
   * balance".
   */
  async contextFor(conversationId: string): Promise<StoredMessage[]> {
    const rows = await prisma.assistantMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: MODEL_CONTEXT_MESSAGES,
      select: { role: true, content: true, createdAt: true },
    });
    return rows
      .reverse()
      .map((row) => ({
        role: row.role === 'assistant' ? 'assistant' : 'user',
        content: row.content,
        at: row.createdAt.getTime(),
      }));
  },

  async listConversations(userId: string, limit = 30): Promise<ConversationSummary[]> {
    const rows = await prisma.assistantConversation.findMany({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        lastMessageAt: true,
        _count: { select: { messages: true } },
        // Just the last message, for the preview line.
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      preview: row.messages[0]?.content.replace(/\s+/g, ' ').slice(0, 120) ?? '',
      lastMessageAt: row.lastMessageAt.getTime(),
      messageCount: row._count.messages,
    }));
  },

  /** The conversation this user was last in, if any. */
  async latestConversation(userId: string): Promise<string | null> {
    const row = await prisma.assistantConversation.findFirst({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    return row?.id ?? null;
  },

  /** Delete one conversation and everything in it. The user's own record. */
  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const result = await prisma.assistantConversation.deleteMany({
      where: { id: conversationId, userId },
    });
    return result.count > 0;
  },

  /** Drop an empty conversation, so a panel opened and closed leaves nothing. */
  async discardIfEmpty(conversationId: string): Promise<void> {
    const count = await prisma.assistantMessage.count({ where: { conversationId } });
    if (count === 0) {
      await prisma.assistantConversation.delete({ where: { id: conversationId } }).catch(() => undefined);
    }
  },
};
