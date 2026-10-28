import { Request, Response } from 'express';
import { KycStatus } from '@prisma/client';

import { AppError, asyncHandler } from '../lib/errors';
import { rejectSchema, reviewDecisionSchema } from '../kyc/kyc.validation';
import { AdminService } from './admin.service';

const adminId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const VALID_STATUS = new Set<KycStatus>([
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
]);

export const AdminController = {
  /** GET /admin/kyc/queue?status=&search=&country=&idType= - pending submissions. */
  kycQueue: asyncHandler(async (req: Request, res: Response) => {
    const rawStatus = String(req.query.status ?? '').toUpperCase();
    const status = VALID_STATUS.has(rawStatus as KycStatus) ? (rawStatus as KycStatus) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const country = req.query.country ? String(req.query.country) : undefined;
    const idType = req.query.idType ? String(req.query.idType).toUpperCase() : undefined;
    res.json(await AdminService.kycQueue({ status, search, country, idType }));
  }),

  /** GET /admin/kyc/:id - full submission detail for review. */
  kycDetail: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminService.kycDetail(req.params.id));
  }),

  approve: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminService.approve(adminId(req), req.params.id));
  }),

  reject: asyncHandler(async (req: Request, res: Response) => {
    const { reason } = rejectSchema.parse(req.body);
    res.json(await AdminService.reject(adminId(req), req.params.id, reason));
  }),

  requestDocuments: asyncHandler(async (req: Request, res: Response) => {
    const { reason } = rejectSchema.parse(req.body);
    res.json(await AdminService.requestDocuments(adminId(req), req.params.id, reason));
  }),

  escalate: asyncHandler(async (req: Request, res: Response) => {
    reviewDecisionSchema.parse(req.body ?? {});
    res.json(await AdminService.escalate(adminId(req), req.params.id));
  }),
};
