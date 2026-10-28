import { Currency } from '@prisma/client';
import { Router } from 'express';

import { asyncHandler } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth.middleware';
import { InsightsService } from './insights.service';

/**
 * A user's own numbers. Every figure here is derived from real rows; where a
 * thing has not happened yet the response says so (null, or an empty series)
 * rather than returning a placeholder the app would render as fact.
 */
const router = Router();

/** Earnings, spending and escrow position over the last N months. */
router.get(
  '/earnings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);
    res.json(await InsightsService.earnings(req.user!.id, months));
  }),
);

/** Deals completed, on-time rate, rating - the reputation block on a profile. */
router.get(
  '/profile-stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await InsightsService.profileStats(req.user!.id));
  }),
);

/**
 * Recorded FX rate history. Starts from the day the feed began recording, so an
 * empty list means "no history yet", never "the rate was zero".
 */
router.get(
  '/fx-history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const quote = String(req.query.currency ?? 'XAF').toUpperCase() as Currency;
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await prisma.fxRateLog.findMany({
      where: { quoteCurrency: quote, fetchedAt: { gte: since } },
      orderBy: { fetchedAt: 'asc' },
      select: { rate: true, fetchedAt: true, provider: true },
    });

    res.json({
      currency: quote,
      days,
      // USD value of one unit, matching how the rest of the pricing math reads it.
      points: rows.map((row) => ({
        at: row.fetchedAt,
        usdPerUnit: Number(row.rate),
      })),
      provider: rows[0]?.provider ?? null,
    });
  }),
);

export default router;
