import { Request, Response } from 'express';
import { z } from 'zod';

import { AppError, asyncHandler } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { recordAudit } from '../lib/audit';
import * as business from './business-analytics.service';
import * as visits from './visits.service';

/** The operator making the request, for the audit trail on cost changes. */
function actorId(req: Request): string {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
}

/**
 * A batch of events from a browser.
 *
 * Everything here is attacker-controlled - the endpoint has to be open to
 * anonymous visitors, because most of the funnel happens before anyone signs
 * up. So the limits are the defence: a bounded batch, bounded strings, and a
 * visitor id the client chooses but cannot make unbounded.
 */
const eventBatchSchema = z.object({
  visitorId: z.string().trim().min(8).max(64),
  events: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        path: z.string().trim().max(512).optional(),
        referrer: z.string().trim().max(512).optional(),
        durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
      }),
    )
    .min(1)
    .max(50),
});

const costSchema = z.object({
  /** First day of the month, as YYYY-MM. */
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month looks like 2026-10'),
  category: z.enum([
    'INFRASTRUCTURE',
    'SALARIES',
    'PAYMENT_PROVIDER',
    'MARKETING',
    'LEGAL_COMPLIANCE',
    'OTHER',
  ]),
  amountXaf: z.number().min(0).max(10_000_000_000),
  note: z.string().trim().max(300).optional(),
});

export const BusinessAnalyticsController = {
  // ---- Ingest (public, anonymous) ----
  /**
   * Record visitor events.
   *
   * Always answers 204, whatever happened. A browser cannot do anything useful
   * with a failure, and an analytics endpoint that returns errors invites a
   * retry loop that costs far more than the lost events.
   */
  ingest: asyncHandler(async (req: Request, res: Response) => {
    const parsed = eventBatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(204).end();

    await visits.recordEvents(
      parsed.data.events.map((event) => ({
        visitorId: parsed.data.visitorId,
        // Taken from the authenticated session, never from the body: a visitor
        // id is self-asserted and a user id must not be.
        userId: req.user?.id ?? null,
        name: event.name,
        path: event.path,
        referrer: event.referrer,
        durationMs: event.durationMs,
      })),
    );
    return res.status(204).end();
  }),

  // ---- Product analytics ----
  product: asyncHandler(async (req: Request, res: Response) => {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const [funnel, activity, cohorts, totals, pages, sources, daily, conversion] =
      await Promise.all([
        business.signupFunnel(),
        business.activity(),
        business.cohorts(),
        visits.visitTotals(),
        visits.pageStats(days),
        visits.trafficSources(days),
        visits.dailyVisits(days),
        visits.visitorToSignupRate(days),
      ]);

    res.json({ funnel, activity, cohorts, visits: totals, pages, sources, daily, conversion });
  }),

  // ---- Financial analytics ----
  financial: asyncHandler(async (req: Request, res: Response) => {
    const monthParam = typeof req.query.month === 'string' ? req.query.month : null;
    const month = monthParam ? new Date(`${monthParam}-01T00:00:00Z`) : new Date();
    if (Number.isNaN(month.getTime())) {
      throw new AppError(400, 'Q-400', 'Month looks like 2026-10.');
    }

    const [revenue, profitability, trend] = await Promise.all([
      business.revenue(),
      business.profitability(month),
      monthlyTrend(),
    ]);

    res.json({ revenue, profitability, trend });
  }),

  // ---- Operating costs ----
  listCosts: asyncHandler(async (_req: Request, res: Response) => {
    const costs = await prisma.operatingCost.findMany({
      orderBy: [{ month: 'desc' }, { category: 'asc' }],
      take: 120,
    });
    res.json(
      costs.map((cost) => ({
        id: cost.id,
        month: cost.month.toISOString().slice(0, 7),
        category: cost.category,
        amountXaf: Number(cost.amountXaf),
        note: cost.note,
      })),
    );
  }),

  upsertCost: asyncHandler(async (req: Request, res: Response) => {
    const input = costSchema.parse(req.body);
    const month = new Date(`${input.month}-01T00:00:00Z`);
    const operator = actorId(req);

    const saved = await prisma.operatingCost.upsert({
      where: { month_category: { month, category: input.category } },
      create: {
        month,
        category: input.category,
        amountXaf: input.amountXaf,
        note: input.note,
        createdById: operator,
      },
      update: { amountXaf: input.amountXaf, note: input.note },
    });

    // Costs decide the profit figure the business is run on, so changing one is
    // an auditable act rather than a form submission.
    void recordAudit({
      actorId: operator,
      action: 'analytics.cost.set',
      entityType: 'OperatingCost',
      entityId: saved.id,
      result: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      after: { month: input.month, category: input.category, amountXaf: input.amountXaf },
    });

    res.json({ id: saved.id, month: input.month, category: saved.category });
  }),

  deleteCost: asyncHandler(async (req: Request, res: Response) => {
    const operator = actorId(req);
    const existing = await prisma.operatingCost.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) throw new AppError(404, 'Q-404', 'Cost entry not found.');

    await prisma.operatingCost.delete({ where: { id: existing.id } });
    void recordAudit({
      actorId: operator,
      action: 'analytics.cost.delete',
      entityType: 'OperatingCost',
      entityId: existing.id,
      result: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      before: {
        month: existing.month.toISOString().slice(0, 7),
        category: existing.category,
        amountXaf: Number(existing.amountXaf),
      },
    });
    res.json({ deleted: true });
  }),
};

/** Revenue, cost and EBITDA for each of the last twelve months. */
async function monthlyTrend() {
  const months: { month: string; revenueXaf: number; costsXaf: number; ebitdaXaf: number | null }[] =
    [];
  const now = new Date();
  for (let back = 11; back >= 0; back -= 1) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const snapshot = await business.profitability(month);
    months.push({
      month: snapshot.month,
      revenueXaf: snapshot.revenueXaf,
      costsXaf: snapshot.costsXaf,
      ebitdaXaf: snapshot.ebitdaXaf,
    });
  }
  return months;
}
