import { Request, Response } from 'express';
import { SupportPriority, SupportTicketStatus } from '@prisma/client';

import { AppError, asyncHandler } from '../lib/errors';
import { SupportAdminService } from './supportadmin.service';
import {
  adminReplySchema,
  helpArticleSchema,
  prioritySchema,
  statusSchema,
} from './supportadmin.validation';

const operatorId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const VALID_STATUS = new Set<SupportTicketStatus>(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']);

export const SupportAdminController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const rawStatus = String(req.query.status ?? '').toUpperCase();
    const status = VALID_STATUS.has(rawStatus as SupportTicketStatus)
      ? (rawStatus as SupportTicketStatus)
      : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    res.json(await SupportAdminService.list({ status, search }));
  }),

  stats: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await SupportAdminService.stats());
  }),

  detail: asyncHandler(async (req: Request, res: Response) => {
    res.json(await SupportAdminService.detail(req.params.id));
  }),

  reply: asyncHandler(async (req: Request, res: Response) => {
    const { body } = adminReplySchema.parse(req.body);
    res.json(await SupportAdminService.reply(operatorId(req), req.params.id, body));
  }),

  setStatus: asyncHandler(async (req: Request, res: Response) => {
    const { status } = statusSchema.parse(req.body);
    res.json(await SupportAdminService.setStatus(operatorId(req), req.params.id, status));
  }),

  setPriority: asyncHandler(async (req: Request, res: Response) => {
    const { priority } = prioritySchema.parse(req.body);
    res.json(
      await SupportAdminService.setPriority(operatorId(req), req.params.id, priority as SupportPriority),
    );
  }),

  assign: asyncHandler(async (req: Request, res: Response) => {
    res.json(await SupportAdminService.assign(operatorId(req), req.params.id));
  }),

  // ---- Help center ----
  listArticles: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await SupportAdminService.listArticles());
  }),

  createArticle: asyncHandler(async (req: Request, res: Response) => {
    const input = helpArticleSchema.parse(req.body);
    res.status(201).json(await SupportAdminService.createArticle(operatorId(req), input));
  }),

  updateArticle: asyncHandler(async (req: Request, res: Response) => {
    const input = helpArticleSchema.parse(req.body);
    res.json(await SupportAdminService.updateArticle(operatorId(req), req.params.id, input));
  }),

  deleteArticle: asyncHandler(async (req: Request, res: Response) => {
    res.json(await SupportAdminService.deleteArticle(operatorId(req), req.params.id));
  }),
};
