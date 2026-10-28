import { Request, Response } from 'express';
import { Currency } from '@prisma/client';

import { AppError, asyncHandler } from '../lib/errors';
import { FeesAdminService } from './feesadmin.service';
import { feeUpdateSchema, fxRateSchema } from './feesadmin.validation';

const adminId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const CURRENCY = new Set<Currency>(['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF']);

export const FeesAdminController = {
  config: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await FeesAdminService.config());
  }),

  updateFees: asyncHandler(async (req: Request, res: Response) => {
    const input = feeUpdateSchema.parse(req.body);
    res.json(await FeesAdminService.updateFees(adminId(req), input));
  }),

  updateFxRate: asyncHandler(async (req: Request, res: Response) => {
    const currency = String(req.params.currency).toUpperCase() as Currency;
    if (!CURRENCY.has(currency)) throw new AppError(400, 'Q-400', 'Unknown currency.');
    const { usdRate } = fxRateSchema.parse(req.body);
    res.json(await FeesAdminService.updateFxRate(adminId(req), currency, usdRate));
  }),
};
