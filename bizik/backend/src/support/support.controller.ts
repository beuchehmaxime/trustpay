import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { SupportService } from './support.service';
import { createTicketSchema, replySchema } from './support.validation';

const userId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

export const SupportController = {
  listMine: asyncHandler(async (req: Request, res: Response) => {
    res.json(await SupportService.listMy(userId(req)));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createTicketSchema.parse(req.body);
    res.status(201).json(await SupportService.create(userId(req), input));
  }),

  detail: asyncHandler(async (req: Request, res: Response) => {
    res.json(await SupportService.detail(userId(req), req.params.id));
  }),

  reply: asyncHandler(async (req: Request, res: Response) => {
    const { body } = replySchema.parse(req.body);
    res.json(await SupportService.reply(userId(req), req.params.id, body));
  }),

  help: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await SupportService.help());
  }),
};
