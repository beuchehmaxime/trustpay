import { Request, Response } from 'express';
import { ContractStatus, Currency } from '@prisma/client';

import { AppError, asyncHandler } from '../lib/errors';
import { ProjectsService } from './projects.service';
import { forceCancelSchema } from './projects.validation';

const adminId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const VALID_STATUS = new Set<ContractStatus>([
  'DRAFT',
  'INVITED',
  'UNDER_REVIEW',
  'SIGNED',
  'FUNDED',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DISPUTED',
  'COMPLETED',
  'CANCELLED',
]);
const VALID_CURRENCY = new Set<Currency>(['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF']);

export const ProjectsController = {
  /** GET /admin/projects?status=&currency=&search=&page=&pageSize= */
  list: asyncHandler(async (req: Request, res: Response) => {
    const rawStatus = String(req.query.status ?? '').toUpperCase();
    const rawCurrency = String(req.query.currency ?? '').toUpperCase();
    const status = VALID_STATUS.has(rawStatus as ContractStatus)
      ? (rawStatus as ContractStatus)
      : undefined;
    const currency = VALID_CURRENCY.has(rawCurrency as Currency)
      ? (rawCurrency as Currency)
      : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    res.json(await ProjectsService.list({ status, currency, search }, page, pageSize));
  }),

  stats: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await ProjectsService.stats());
  }),

  detail: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ProjectsService.detail(req.params.id));
  }),

  forceCancel: asyncHandler(async (req: Request, res: Response) => {
    const { reason } = forceCancelSchema.parse(req.body ?? {});
    res.json(await ProjectsService.forceCancel(adminId(req), req.params.id, reason));
  }),

  forceComplete: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ProjectsService.forceComplete(adminId(req), req.params.id));
  }),

  templates: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await ProjectsService.templates());
  }),

  deleteTemplate: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ProjectsService.deleteTemplate(adminId(req), req.params.id));
  }),
};
