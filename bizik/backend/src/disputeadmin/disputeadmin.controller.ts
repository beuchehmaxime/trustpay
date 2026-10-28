import { Request, Response } from 'express';
import { DisputeStatus } from '@prisma/client';

import { AppError, asyncHandler } from '../lib/errors';
import { DisputeAdminService } from './disputeadmin.service';
import {
  assignSchema,
  escalateSchema,
  messageSchema,
  ruleSchema,
} from './disputeadmin.validation';

const adminId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const VALID_STATUS = new Set<DisputeStatus>([
  'FILED',
  'AWAITING_RESPONSE',
  'UNDER_REVIEW',
  'ESCALATED',
  'RESOLVED',
  'AUTO_RULED',
]);

export const DisputeAdminController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const rawStatus = String(req.query.status ?? '').toUpperCase();
    const status = VALID_STATUS.has(rawStatus as DisputeStatus)
      ? (rawStatus as DisputeStatus)
      : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    res.json(await DisputeAdminService.list({ status }, page, pageSize));
  }),

  stats: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await DisputeAdminService.stats());
  }),

  mediators: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await DisputeAdminService.mediators());
  }),

  detail: asyncHandler(async (req: Request, res: Response) => {
    res.json(await DisputeAdminService.detail(req.params.id));
  }),

  assign: asyncHandler(async (req: Request, res: Response) => {
    const { mediatorId } = assignSchema.parse(req.body);
    res.json(await DisputeAdminService.assign(adminId(req), req.params.id, mediatorId));
  }),

  escalate: asyncHandler(async (req: Request, res: Response) => {
    const { note } = escalateSchema.parse(req.body ?? {});
    res.json(await DisputeAdminService.escalate(adminId(req), req.params.id, note));
  }),

  message: asyncHandler(async (req: Request, res: Response) => {
    const { body } = messageSchema.parse(req.body);
    res.json(await DisputeAdminService.message(adminId(req), req.params.id, body));
  }),

  rule: asyncHandler(async (req: Request, res: Response) => {
    const input = ruleSchema.parse(req.body);
    res.json(await DisputeAdminService.rule(adminId(req), req.params.id, input));
  }),
};
