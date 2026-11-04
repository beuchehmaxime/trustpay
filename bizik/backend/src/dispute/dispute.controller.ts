import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { DisputeService } from './dispute.service';
import { evidenceSchema, messageSchema, resolveSchema } from './dispute.validation';

const actor = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user;
};

/**
 * This is the CONSUMER API. Nobody gets staff powers here.
 *
 * These handlers used to pass `req.user.role` into the service, which grants
 * an admin bypass on viewing, messaging and RESOLVING any dispute. So an
 * operator who signed into the user app could open a case they were not party
 * to - and, worse, the bypass keys off the role string alone with no
 * permission check, so an operator holding only `support.view` could rule on
 * a dispute and move the money.
 *
 * Staff act through /admin/disputes, where every route is behind
 * requirePermission. Here everyone is a party or they are nobody.
 */
const AS_A_PARTY = 'client';

export const DisputeController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json(await DisputeService.list(actor(req).id));
  }),

  byId: asyncHandler(async (req: Request, res: Response) => {
    const u = actor(req);
    res.json(await DisputeService.byId(u.id, req.params.id, AS_A_PARTY));
  }),

  message: asyncHandler(async (req: Request, res: Response) => {
    const u = actor(req);
    const input = messageSchema.parse(req.body);
    res.json(await DisputeService.addMessage(u.id, req.params.id, input, AS_A_PARTY));
  }),

  resolve: asyncHandler(async (req: Request, res: Response) => {
    const u = actor(req);
    const input = resolveSchema.parse(req.body);
    res.json(await DisputeService.resolve(u.id, req.params.id, input, AS_A_PARTY));
  }),

  addEvidence: asyncHandler(async (req: Request, res: Response) => {
    const u = actor(req);
    const input = evidenceSchema.parse(req.body);
    res.json(await DisputeService.addEvidence(u.id, req.params.id, input, AS_A_PARTY));
  }),

  withdraw: asyncHandler(async (req: Request, res: Response) => {
    res.json(await DisputeService.withdraw(actor(req).id, req.params.id));
  }),
};
