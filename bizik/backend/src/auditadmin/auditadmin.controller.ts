import { Request, Response } from 'express';

import { asyncHandler } from '../lib/errors';
import { AuditAdminService } from './auditadmin.service';

const VALID_DAYS = new Set([7, 30, 90]);
const VALID_RESULT = new Set(['SUCCESS', 'FAILED']);

export const AuditAdminController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const days = Number(req.query.days);
    const rawResult = String(req.query.result ?? '').toUpperCase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
    res.json(
      await AuditAdminService.list(
        {
          action: req.query.action ? String(req.query.action) : undefined,
          actorId: req.query.actorId ? String(req.query.actorId) : undefined,
          result: VALID_RESULT.has(rawResult) ? rawResult : undefined,
          days: VALID_DAYS.has(days) ? days : undefined,
          search: req.query.search ? String(req.query.search) : undefined,
        },
        page,
        pageSize,
      ),
    );
  }),

  filters: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await AuditAdminService.filters());
  }),
};
