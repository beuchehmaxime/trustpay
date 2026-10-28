import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { KycService } from './kyc.service';
import { submitKycSchema } from './kyc.validation';

const userId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

export const KycController = {
  /** GET /kyc/status - the signed-in user's verification state. */
  status: asyncHandler(async (req: Request, res: Response) => {
    res.json(await KycService.status(userId(req)));
  }),

  /** POST /kyc/submit - submit ID + selfie for verification. */
  submit: asyncHandler(async (req: Request, res: Response) => {
    const input = submitKycSchema.parse(req.body);
    res.status(201).json(await KycService.submit(userId(req), input));
  }),
};
