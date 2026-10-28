import { config } from '../config/env';
import { redis } from '../lib/redis';

/**
 * Spend guard for the AI turn. Every free-text message costs a model call, and
 * a WhatsApp account is free to create, so an unbounded channel is both a cost
 * risk and a denial-of-wallet vector. Counters are per calendar day (UTC) and
 * expire on their own; the deterministic menu, commands and flows keep working
 * once a ceiling is reached - only the LLM is refused.
 */

const dayStamp = () => new Date().toISOString().slice(0, 10);
const DAY_SECONDS = 26 * 60 * 60; // a day plus slack, so the key always outlives its window

export type BudgetVerdict = 'ok' | 'user_exhausted' | 'platform_exhausted';

async function bump(key: string, limit: number): Promise<boolean> {
  if (limit <= 0) return true; // 0 (or negative) disables the ceiling
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, DAY_SECONDS);
  return used <= limit;
}

export const WhatsAppBudget = {
  /**
   * Count one AI turn against the per-user and platform-wide daily ceilings.
   * Call this immediately before handing a message to the model.
   */
  async consumeTurn(userId: string): Promise<BudgetVerdict> {
    const day = dayStamp();
    const withinUser = await bump(`wa:ai:user:${userId}:${day}`, config.whatsapp.aiTurnsPerUserDaily);
    if (!withinUser) return 'user_exhausted';
    const withinPlatform = await bump(`wa:ai:all:${day}`, config.whatsapp.aiTurnsGlobalDaily);
    if (!withinPlatform) return 'platform_exhausted';
    return 'ok';
  },

  /** What to tell the user when a ceiling is hit - never blame them for a platform cap. */
  message(verdict: Exclude<BudgetVerdict, 'ok'>): string {
    if (verdict === 'user_exhausted') {
      return "You've reached today's limit for chatting with me. The menu still works. Type *MENU* to fund, release, check your wallet or see your deals. Full chat is back tomorrow.";
    }
    return 'The assistant is very busy right now. Type *MENU*. Every action still works from there.';
  },
};
