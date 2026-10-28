import { Request, Response } from 'express';
import { AmlAlertStatus, AmlAlertType } from '@prisma/client';

import { AppError, asyncHandler } from '../lib/errors';
import { AmlService } from './aml.service';
import { noteBodySchema, noteSchema, sarSchema } from './aml.validation';

const actorId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const VALID_STATUS = new Set<AmlAlertStatus>(['NEW', 'UNDER_REVIEW', 'CLEARED', 'ESCALATED']);
const VALID_TYPE = new Set<AmlAlertType>([
  'STRUCTURING',
  'SANCTIONS_MATCH',
  'HIGH_RISK_FLOW',
  'VELOCITY_ANOMALY',
  'PEP_MATCH',
]);

export const AmlController = {
  /** GET /admin/aml/alerts?status=&type=&search= */
  list: asyncHandler(async (req: Request, res: Response) => {
    const rawStatus = String(req.query.status ?? '').toUpperCase();
    const rawType = String(req.query.type ?? '').toUpperCase();
    const status = VALID_STATUS.has(rawStatus as AmlAlertStatus)
      ? (rawStatus as AmlAlertStatus)
      : undefined;
    const type = VALID_TYPE.has(rawType as AmlAlertType) ? (rawType as AmlAlertType) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    res.json(await AmlService.list({ status, type, search }));
  }),

  stats: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await AmlService.stats());
  }),

  detail: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AmlService.detail(req.params.id));
  }),

  timeline: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AmlService.timeline(req.params.id));
  }),

  addNote: asyncHandler(async (req: Request, res: Response) => {
    const { note } = noteBodySchema.parse(req.body);
    res.json(await AmlService.addNote(actorId(req), req.params.id, note));
  }),

  review: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AmlService.startReview(actorId(req), req.params.id));
  }),

  clear: asyncHandler(async (req: Request, res: Response) => {
    const { note } = noteSchema.parse(req.body ?? {});
    res.json(await AmlService.clear(actorId(req), req.params.id, note));
  }),

  escalate: asyncHandler(async (req: Request, res: Response) => {
    const { note } = noteSchema.parse(req.body ?? {});
    res.json(await AmlService.escalate(actorId(req), req.params.id, note));
  }),

  freeze: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AmlService.freezeAccount(actorId(req), req.params.id));
  }),

  fileSar: asyncHandler(async (req: Request, res: Response) => {
    const { narrative } = sarSchema.parse(req.body);
    res.json(await AmlService.fileSar(actorId(req), req.params.id, narrative));
  }),
};
