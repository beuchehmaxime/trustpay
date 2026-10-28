import { Request, Response } from 'express';

import { asyncHandler } from '../lib/errors';
import { FxService } from './fx.service';
import { fxRateSchema } from './fx.validation';

export const FxController = {
  rate: asyncHandler(async (req: Request, res: Response) => {
    const input = fxRateSchema.parse(req.query);
    res.json(FxService.rate(input));
  }),
};
