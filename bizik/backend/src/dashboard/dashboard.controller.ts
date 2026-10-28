import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { DashboardService } from './dashboard.service';

const operatorId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

export const DashboardController = {
  overview: asyncHandler(async (req: Request, res: Response) => {
    res.json(await DashboardService.overview(operatorId(req)));
  }),
};
