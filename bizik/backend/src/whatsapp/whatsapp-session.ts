import { config } from '../config/env';
import { redis } from '../lib/redis';

/**
 * Ephemeral per-user conversation state (Redis). Holds the current multi-step
 * flow, any pending action awaiting confirmation/PIN, a short rolling history
 * for the LLM, and the last step-up-auth time. Durable settings (PIN, opt-in)
 * live in the DB (WhatsAppChannel), not here.
 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** A money/sensitive action the user must confirm (and PIN) before it executes. */
export interface PendingAction {
  tool: string; // e.g. 'fund_deal'
  args: Record<string, unknown>;
  summary: string; // human-readable confirmation text
  requiresPin: boolean;
}

/** A money action that failed, so we don't re-offer it the moment after. */
export interface FailedAction {
  tool: string;
  /** Stable fingerprint of the arguments, to spot the SAME action again. */
  argsKey: string;
  /** Looser fingerprint (tool + amount + currency) - catches the case where the
   *  recipient string drifts (raw input vs. resolved handle) on a re-proposal. */
  looseKey?: string;
  at: number;
  /** Why it failed, so we can tell the user instead of silently retrying. */
  message: string;
}

export interface WaSession {
  phone: string;
  userId?: string;
  locale: 'en' | 'fr';
  flow?: { name: string; step: string; data: Record<string, unknown> };
  pending?: PendingAction;
  pendingAfterKyc?: PendingAction; // action to resume once KYC verification passes
  inviteDealId?: string; // a deal this number was invited to (pending accept)
  awaitingPin?: boolean; // user was asked to type their PIN next
  awaitingPinSetup?: boolean; // user is setting a new PIN
  history: ChatTurn[];
  lastStepUpAt?: number; // epoch ms of last successful PIN entry
  lastFailedAction?: FailedAction;
  updatedAt: number;
}

const key = (phone: string) => `wa:session:${phone}`;
const HISTORY_MAX = 12;

export const WaSessionStore = {
  async get(phone: string): Promise<WaSession | null> {
    const raw = await redis.get(key(phone));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WaSession;
    } catch {
      return null;
    }
  },

  async save(session: WaSession): Promise<void> {
    session.updatedAt = Date.now();
    if (session.history.length > HISTORY_MAX) {
      session.history = session.history.slice(-HISTORY_MAX);
    }
    await redis.set(key(session.phone), JSON.stringify(session), {
      EX: config.whatsapp.sessionTtlMinutes * 60,
    });
  },

  async clear(phone: string): Promise<void> {
    await redis.del(key(phone));
  },

  /** Whether a recent PIN step-up is still valid (default 5 min window). */
  stepUpValid(session: WaSession, windowMs = 5 * 60 * 1000): boolean {
    return !!session.lastStepUpAt && Date.now() - session.lastStepUpAt < windowMs;
  },

  /**
   * Persistent "last seen" (30-day key) - survives the short session TTL so we
   * can tell a returning user "welcome back" only after a real gap, not every
   * time the 30-minute session expires.
   */
  async getLastSeen(phone: string): Promise<number> {
    const raw = await redis.get(`wa:seen:${phone}`);
    return raw ? Number(raw) : 0;
  },

  async touchLastSeen(phone: string): Promise<void> {
    await redis.set(`wa:seen:${phone}`, String(Date.now()), { EX: 30 * 24 * 60 * 60 });
  },
};
