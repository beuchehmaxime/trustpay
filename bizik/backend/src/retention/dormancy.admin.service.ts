import { recordAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { verifyPassword } from '../lib/password';
import { prisma } from '../lib/prisma';
import { systemSettings } from '../lib/system-settings';
import { deleteAccount } from './account-deletion';
import { dormancyRules, findCandidates, NOTICE_SCHEDULE } from './dormancy.service';

/**
 * The operator side of dormant-account cleanup.
 *
 * The schedule finds candidates and warns them; nothing is ever deleted without
 * a person deciding. This is that decision, and it is deliberately awkward:
 * the operator needs a permission that nothing else grants, must re-enter their
 * password, and every outcome - including every refusal - is written to the
 * audit log.
 *
 * The password is not theatre. `accounts.purge` is the single most destructive
 * permission in the console, and an unattended session is the realistic way it
 * gets misused. Re-authenticating proves the person at the keyboard is the
 * account holder, right now.
 */

export interface DormancyReview {
  rules: { unverifiedDays: number; inactiveDays: number; notices: readonly number[] };
  /** Whether warnings are being sent at all. Off means nothing becomes eligible. */
  warningsEnabled: boolean;
  candidates: {
    userId: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    reason: string;
    createdAt: Date;
    scheduledFor: Date;
    noticesSent: number;
    eligible: boolean;
  }[];
  /** How many may be deleted right now - warned in full and past their date. */
  eligibleCount: number;
}

export const DormancyAdminService = {
  /** Everything up for review, including candidates still inside their notice period. */
  async review(): Promise<DormancyReview> {
    const candidates = await findCandidates();
    const rules = dormancyRules();
    return {
      rules: { ...rules, notices: NOTICE_SCHEDULE },
      warningsEnabled: systemSettings().retention.dormancyEnabled,
      candidates: candidates.map((candidate) => ({
        userId: candidate.userId,
        fullName: candidate.fullName,
        phone: candidate.phone,
        email: candidate.email,
        reason: candidate.reason,
        createdAt: candidate.createdAt,
        scheduledFor: candidate.scheduledFor,
        noticesSent: candidate.noticesSent,
        eligible: candidate.eligible,
      })),
      eligibleCount: candidates.filter((candidate) => candidate.eligible).length,
    };
  },

  /**
   * Delete the accounts an operator has chosen.
   *
   * `userIds` is required and explicit - there is no "delete everything
   * eligible" call. The operator names the accounts, so the thing they
   * confirmed is the thing that happens, and a candidate list that changed
   * between rendering and clicking cannot silently widen the blast radius.
   */
  async purge(
    operatorId: string,
    password: string,
    userIds: string[],
    context: { ipAddress?: string | null; userAgent?: string | null } = {},
  ) {
    if (userIds.length === 0) {
      throw new AppError(400, 'Q-400', 'Select at least one account to delete.');
    }

    const operator = await prisma.user.findUnique({ where: { id: operatorId } });
    if (!operator?.passwordHash) {
      throw new AppError(403, 'Q-403', 'This account cannot confirm a deletion.');
    }
    const confirmed = await verifyPassword(password, operator.passwordHash);
    if (!confirmed) {
      // Audited as a failure. A wrong password on the most destructive action in
      // the console is worth seeing, whether it is a typo or somebody else at an
      // unlocked screen.
      await recordAudit({
        actorId: operatorId,
        action: 'accounts.purge.denied',
        entityType: 'User',
        result: 'FAILED',
        after: { attempted: userIds.length },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new AppError(401, 'Q-401', 'That password is not correct.');
    }

    // Only accounts the rules currently agree are eligible. The operator's list
    // is a selection FROM this, never an addition to it - so a crafted request
    // cannot delete an account that was never a candidate.
    const candidates = await findCandidates();
    const eligible = new Map(
      candidates.filter((candidate) => candidate.eligible).map((candidate) => [candidate.userId, candidate]),
    );

    const results: { userId: string; name: string; deleted: boolean; reason?: string }[] = [];

    for (const userId of userIds) {
      const candidate = eligible.get(userId);
      if (!candidate) {
        results.push({
          userId,
          name: '',
          deleted: false,
          reason: 'no longer eligible - it has had activity, or its notice period is not finished',
        });
        continue;
      }

      const outcome = await deleteAccount(userId);
      results.push({
        userId,
        name: candidate.fullName,
        deleted: outcome.deleted,
        reason: outcome.deleted ? undefined : outcome.blockers.join('; '),
      });

      await recordAudit({
        actorId: operatorId,
        action: outcome.deleted ? 'accounts.purge' : 'accounts.purge.refused',
        entityType: 'User',
        entityId: userId,
        result: outcome.deleted ? 'SUCCESS' : 'FAILED',
        // The account is about to stop existing, so the audit row carries who it
        // was. An entry naming only an id nobody can resolve is not a record.
        before: {
          fullName: candidate.fullName,
          phone: candidate.phone,
          email: candidate.email,
          reason: candidate.reason,
          createdAt: candidate.createdAt,
          noticesSent: candidate.noticesSent,
        },
        after: outcome.deleted ? { deleted: true } : { blockers: outcome.blockers },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }

    const deleted = results.filter((result) => result.deleted).length;
    console.log(
      `[dormancy] operator ${operatorId} deleted ${deleted} of ${userIds.length} selected account(s)`,
    );
    return { deleted, refused: results.length - deleted, results };
  },
};
