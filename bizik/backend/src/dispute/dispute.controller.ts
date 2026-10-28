import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { DisputeService } from './dispute.service';
import { evidenceSchema, messageSchema, resolveSchema } from './dispute.validation';

const actor = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user;
};

export const DisputeController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json(await DisputeService.list(actor(req).id));
  }),

  byId: asyncHandler(async (req: Request, res: Response) => {
    const u = actor(req);
    res.json(await DisputeService.byId(u.id, req.params.id, u.role));
  }),

  message: asyncHandler(async (req: Request, res: Response) => {
    const u = actor(req);
    const input = messageSchema.parse(req.body);
    res.json(await DisputeService.addMessage(u.id, req.params.id, input, u.role));
  }),

  resolve: asyncHandler(async (req: Request, res: Response) => {
    const u = actor(req);
    const input = resolveSchema.parse(req.body);
    res.json(await DisputeService.resolve(u.id, req.params.id, input, u.role));
  }),

  addEvidence: asyncHandler(async (req: Request, res: Response) => {
    const u = actor(req);
    const input = evidenceSchema.parse(req.body);
    res.json(await DisputeService.addEvidence(u.id, req.params.id, input, u.role));
  }),

  withdraw: asyncHandler(async (req: Request, res: Response) => {
    res.json(await DisputeService.withdraw(actor(req).id, req.params.id));
  }),
};
