import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import {
  normalizeUsername,
  usernameCandidates,
  usernameProblemMessage,
  validateUsername,
} from './username';

/**
 * Claiming and resolving handles. Uniqueness is enforced by the database, not by
 * a read-then-write check: two people signing up at the same moment with the
 * same name would both see "free" and one would fail, so we try candidates in
 * order and let the unique constraint decide the winner.
 */

/** Prisma's error for "a unique constraint would be violated". */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === 'P2002';
}

export const UsernameService = {
  /**
   * Give this user a handle derived from their name, skipping any already taken.
   * Idempotent: a user who already has one keeps it.
   */
  async ensureFor(userId: string, fullName: string): Promise<string> {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (existing?.username) return existing.username;

    for (const candidate of usernameCandidates(fullName, 40)) {
      try {
        const updated = await prisma.user.update({
          where: { id: userId },
          data: { username: candidate },
          select: { username: true },
        });
        return updated.username as string;
      } catch (error) {
        if (isUniqueViolation(error)) continue; // taken between our try and theirs
        throw error;
      }
    }
    // 40 variants of a name all taken is implausible; fall back to something
    // certainly free rather than leaving the account without a handle.
    const fallback = `qtq.${userId.replace(/-/g, '').slice(-8)}`;
    await prisma.user.update({ where: { id: userId }, data: { username: fallback } });
    return fallback;
  },

  /** Is this handle free (and allowed)? Used by the "change my handle" screen. */
  async isAvailable(candidate: string): Promise<boolean> {
    const value = candidate.trim().toLowerCase();
    if (validateUsername(value) !== null) return false;
    const owner = await prisma.user.findUnique({ where: { username: value }, select: { id: true } });
    return !owner;
  },

  /** Let a user take a specific handle, if it is valid and free. */
  async claim(userId: string, desired: string): Promise<string> {
    const value = normalizeUsername(desired);
    const problem = validateUsername(value);
    if (problem) throw new AppError(400, 'Q-400', usernameProblemMessage(problem));
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { username: value },
        select: { username: true },
      });
      return updated.username as string;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'Q-409', 'That handle is already taken. Try another.');
      }
      throw error;
    }
  },

  /**
   * Find a user by handle. Accepts what people actually type: "@maxime.b",
   * " Maxime.B ", "maxime.b".
   */
  async findByHandle(handle: string) {
    const value = handle.trim().replace(/^@+/, '').toLowerCase();
    if (!value) return null;
    return prisma.user.findUnique({
      where: { username: value },
      select: { id: true, fullName: true, username: true, country: true, status: true },
    });
  },

  /**
   * Give every account without a handle one. Run once after deploy; safe to run
   * again (accounts that already have a handle are skipped).
   */
  async backfill(): Promise<{ updated: number }> {
    const pending = await prisma.user.findMany({
      where: { username: null },
      select: { id: true, fullName: true },
    });
    let updated = 0;
    for (const user of pending) {
      await this.ensureFor(user.id, user.fullName);
      updated += 1;
    }
    return { updated };
  },
};
