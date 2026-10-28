import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { AnalyticsService } from './analytics.service';
import { generateReportSchema } from './analytics.validation';

const adminId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const DAY = 24 * 60 * 60 * 1000;

/** Parse a query date, falling back to the default. */
function parseDate(raw: unknown, fallback: Date): Date {
  if (!raw) return fallback;
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export const AnalyticsController = {
  overview: asyncHandler(async (req: Request, res: Response) => {
    const now = new Date();
    const from = parseDate(req.query.from, new Date(now.getTime() - 180 * DAY));
    const to = parseDate(req.query.to, now);
    if (from >= to) throw new AppError(400, 'Q-400', 'Invalid date range.');
    res.json(await AnalyticsService.overview(from, to));
  }),

  reports: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await AnalyticsService.reports());
  }),

  generate: asyncHandler(async (req: Request, res: Response) => {
    const { type } = generateReportSchema.parse(req.body);
    res.json(await AnalyticsService.generate(adminId(req), type));
  }),
};
