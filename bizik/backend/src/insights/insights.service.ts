import { Currency } from '@prisma/client';

import { isLiveMilestone, resolveParties } from '../lib/contract-flow';
import { homeCurrencyFor, toUsd, fromUsd } from '../lib/domain';
import { AppError } from '../lib/errors';
import { round2 } from '../lib/fees';
import { prisma } from '../lib/prisma';

/**
 * A user's own numbers, computed from what actually happened.
 *
 * These three views existed in the apps with nothing behind them, so the
 * screens either showed placeholders or hid themselves. Everything here is
 * derived from real rows - released milestones, completed deals, delivery dates
 * met - and anything with no data yet reports its absence (null / 0 with a
 * count) rather than a flattering invention.
 */

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export const InsightsService = {
  /**
   * Earnings and spending over time, in the user's home currency.
   *
   * Money is counted at RELEASE, not at agreement: a funded milestone is not
   * income until it is actually paid out, and counting it earlier would flatter
   * the number.
   */
  async earnings(userId: string, months = 6) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { country: true },
    });
    if (!user) throw new AppError(404, 'Q-404', 'Account not found');
    const currency = homeCurrencyFor(user.country);

    const since = new Date(Date.now() - months * MONTH_MS);
    const contracts = await prisma.contract.findMany({
      where: {
        OR: [{ creatorId: userId }, { counterpartyId: userId }],
      },
      include: { milestones: true },
    });

    // Convert every figure into the viewer's own currency so the totals add up.
    const inHome = (amount: number, from: Currency) =>
      from === currency ? amount : fromUsd(toUsd(amount, from), currency);

    const buckets = new Map<string, { month: string; earned: number; paid: number }>();
    for (let offset = months - 1; offset >= 0; offset -= 1) {
      const month = monthKey(new Date(Date.now() - offset * MONTH_MS));
      buckets.set(month, { month, earned: 0, paid: 0 });
    }

    let earnedTotal = 0;
    let paidTotal = 0;
    let inEscrow = 0;

    for (const contract of contracts) {
      const { payerId, payeeId } = resolveParties(contract);
      const isPayee = payeeId === userId;
      const isPayer = payerId === userId;
      if (!isPayee && !isPayer) continue;

      for (const milestone of contract.milestones.filter(isLiveMilestone)) {
        const amount = inHome(Number(milestone.amount), contract.currency);

        if (milestone.status === 'RELEASED') {
          const when = milestone.autoReleaseAt ?? milestone.submittedAt ?? contract.updatedAt;
          if (isPayee) earnedTotal += amount;
          if (isPayer) paidTotal += amount;
          if (when >= since) {
            const bucket = buckets.get(monthKey(when));
            if (bucket) {
              if (isPayee) bucket.earned += amount;
              if (isPayer) bucket.paid += amount;
            }
          }
        } else if (['FUNDED', 'ACTIVE', 'SUBMITTED', 'APPROVED'].includes(milestone.status)) {
          inEscrow += amount;
        }
      }
    }

    return {
      currency,
      totals: {
        earned: round2(earnedTotal),
        paid: round2(paidTotal),
        inEscrow: round2(inEscrow),
      },
      series: [...buckets.values()].map((bucket) => ({
        month: bucket.month,
        earned: round2(bucket.earned),
        paid: round2(bucket.paid),
      })),
    };
  },

  /**
   * The reputation numbers shown on a profile.
   *
   * `rating` is null until somebody has actually rated this person - a 5.0 with
   * no reviews behind it is worse than showing nothing, because it invites
   * trust that was never earned.
   */
  async profileStats(userId: string) {
    const [contracts, reviews] = await Promise.all([
      prisma.contract.findMany({
        where: { OR: [{ creatorId: userId }, { counterpartyId: userId }] },
        include: { milestones: true },
      }),
      prisma.review.findMany({ where: { revieweeId: userId }, select: { rating: true } }),
    ]);

    const completed = contracts.filter((contract) => contract.status === 'COMPLETED');

    // On time = every delivered milestone was submitted by its due date. Only
    // milestones that HAVE both a deadline and a submission can be judged.
    let judged = 0;
    let onTime = 0;
    for (const contract of contracts) {
      for (const milestone of contract.milestones) {
        if (!milestone.deadline || !milestone.submittedAt) continue;
        judged += 1;
        if (milestone.submittedAt <= milestone.deadline) onTime += 1;
      }
    }

    // A dispute is linked to its contract, so count the ones on THIS user's
    // deals rather than assuming a filer/respondent column that doesn't exist.
    const disputes = await prisma.dispute.count({
      where: { contractId: { in: contracts.map((contract) => contract.id) } },
    });

    return {
      dealsCompleted: completed.length,
      dealsTotal: contracts.length,
      /** Null when nothing has been delivered yet - not 100%. */
      onTimeRate: judged > 0 ? Math.round((onTime / judged) * 100) : null,
      onTimeSample: judged,
      /** Null until someone rates them. */
      rating: reviews.length
        ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) / 10
        : null,
      reviewCount: reviews.length,
      disputeCount: disputes,
    };
  },
};
