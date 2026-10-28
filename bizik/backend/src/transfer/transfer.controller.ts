import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { UsernameService } from '../user/username.service';
import { TransferService } from './transfer.service';
import { claimHandleSchema, lookupHandleSchema, sendMoneySchema } from './transfer.validation';

const userId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

export const TransferController = {
  /** The signed-in user's own handle - what they share to get paid. */
  me: asyncHandler(async (req: Request, res: Response) => {
    res.json(await TransferService.myHandle(userId(req)));
  }),

  /** Choose a different handle (must be free and allowed). */
  claimHandle: asyncHandler(async (req: Request, res: Response) => {
    const input = claimHandleSchema.parse(req.body);
    const username = await UsernameService.claim(userId(req), input.username);
    res.json({ username });
  }),

  /**
   * Who is behind this handle/number? Returns a NAME only - never a phone or
   * email - so a lookup can confirm the right person without leaking contacts.
   */
  lookup: asyncHandler(async (req: Request, res: Response) => {
    const input = lookupHandleSchema.parse({ handle: req.query.handle });
    const found = await TransferService.resolveRecipient(input.handle);
    if (!found || found.id === userId(req)) {
      res.json({ found: false, self: found?.id === userId(req) });
      return;
    }
    res.json({ found: true, fullName: found.fullName, username: found.username });
  }),

  /** Send money from the signed-in user's wallet to another BiZik user. */
  send: asyncHandler(async (req: Request, res: Response) => {
    const input = sendMoneySchema.parse(req.body);
    res.status(201).json(await TransferService.send(userId(req), input));
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 30;
    res.json(await TransferService.list(userId(req), limit));
  }),

  byId: asyncHandler(async (req: Request, res: Response) => {
    res.json(await TransferService.shape(req.params.id, userId(req)));
  }),
};
