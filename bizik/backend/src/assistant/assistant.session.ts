import { randomUUID } from 'crypto';

import { config } from '../config/env';
import { redis } from '../lib/redis';
import type { PendingAction } from '../whatsapp/whatsapp-session';

/**
 * Conversation state for the in-app assistant, keyed on the signed-in user.
 *
 * The WhatsApp session is keyed on a phone number because that is all that
 * channel knows about who is talking. In the app we have an authenticated
 * user id, so this is keyed on that instead - which also means a user talking
 * in the app and the same user talking on WhatsApp do not share a thread. That
 * is deliberate: the two surfaces authenticate differently (a JWT session here,
 * number control there) and silently merging them would let the weaker factor
 * inherit the stronger one's context.
 *
 * Redis, not Postgres: a chat thread is working state, not a record. It expires
 * on its own, and nothing in the ledger depends on it.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

/**
 * A proposed money action, plus the id the client must quote to approve it.
 *
 * The id is the point. The client never sends back the action itself - it sends
 * back only this id, and the server looks up what it actually proposed. A
 * client that tried to confirm a different amount, a different recipient or a
 * different tool has nothing to put in the request that would carry it.
 */
export interface PendingProposal extends PendingAction {
  id: string;
  proposedAt: number;
}

export interface AssistantSession {
  userId: string;
  locale: 'en' | 'fr';
  /**
   * Which stored conversation this session is writing into.
   *
   * The messages themselves live in Postgres. This is the only part of a
   * conversation worth caching: it says where to append, and losing it costs
   * nothing but reopening the most recent thread.
   */
  conversationId?: string;
  /** Kept only to carry the shape the model reads; the record is in Postgres. */
  messages: ChatMessage[];
  pending?: PendingProposal;
  /** Epoch ms of the last successful PIN entry, for the step-up window. */
  lastStepUpAt?: number;
  updatedAt: number;
}

const sessionKey = (userId: string) => `assistant:session:${userId}`;

/** How much of the conversation the model is shown. Longer costs tokens on
 *  every turn and buys very little: these are task conversations, not essays. */
const HISTORY_MAX = 16;

/**
 * How long a proposal stays approvable.
 *
 * A confirmation that is still live an hour later is a trap: the user has
 * forgotten what they agreed to and the balances it was computed against have
 * moved. Five minutes is long enough to read it and fetch your PIN.
 */
export const PROPOSAL_TTL_MS = 5 * 60 * 1000;

/** How long a PIN entry authorises further money actions without re-entry. */
export const STEP_UP_WINDOW_MS = 5 * 60 * 1000;

export const AssistantSessionStore = {
  async get(userId: string): Promise<AssistantSession | null> {
    const raw = await redis.get(sessionKey(userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AssistantSession;
    } catch {
      // A session that will not parse is worth less than no session: carry on
      // with a fresh one rather than failing the user's message.
      return null;
    }
  },

  async getOrCreate(userId: string, locale: 'en' | 'fr'): Promise<AssistantSession> {
    const existing = await this.get(userId);
    if (existing) return existing;
    return { userId, locale, messages: [], updatedAt: Date.now() };
  },

  async save(session: AssistantSession): Promise<void> {
    session.updatedAt = Date.now();
    if (session.messages.length > HISTORY_MAX) {
      session.messages = session.messages.slice(-HISTORY_MAX);
    }
    await redis.set(sessionKey(session.userId), JSON.stringify(session), {
      EX: config.whatsapp.sessionTtlMinutes * 60,
    });
  },

  async clear(userId: string): Promise<void> {
    await redis.del(sessionKey(userId));
  },

  /** Build a proposal from a tool's pending action, stamped and identified. */
  propose(pending: PendingAction): PendingProposal {
    return { ...pending, id: randomUUID(), proposedAt: Date.now() };
  },

  /** Has this proposal aged out of its approval window? */
  expired(proposal: PendingProposal, now = Date.now()): boolean {
    return now - proposal.proposedAt > PROPOSAL_TTL_MS;
  },

  /** Is a recent PIN entry still covering money actions? */
  stepUpValid(session: AssistantSession, now = Date.now()): boolean {
    return !!session.lastStepUpAt && now - session.lastStepUpAt < STEP_UP_WINDOW_MS;
  },
};
