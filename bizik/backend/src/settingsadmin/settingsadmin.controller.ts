import { Request, Response } from 'express';
import { LegalDocType } from '@prisma/client';

import { AppError, asyncHandler } from '../lib/errors';
import { SettingsAdminService } from './settingsadmin.service';
import { legalUpdateSchema } from './settingsadmin.validation';

const actorId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const VALID_DOC = new Set<LegalDocType>([
  'TERMS',
  'PRIVACY',
  'AML_POLICY',
  'COOKIE',
  'ACCEPTABLE_USE',
]);

function docType(req: Request): LegalDocType {
  const type = String(req.params.type).toUpperCase() as LegalDocType;
  if (!VALID_DOC.has(type)) throw new AppError(404, 'Q-404', 'Unknown legal document.');
  return type;
}

export const SettingsAdminController = {
  overview: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await SettingsAdminService.overview());
  }),

  updateGroup: asyncHandler(async (req: Request, res: Response) => {
    res.json(await SettingsAdminService.updateGroup(actorId(req), req.params.group, req.body));
  }),

  legal: asyncHandler(async (req: Request, res: Response) => {
    res.json(await SettingsAdminService.legal(docType(req)));
  }),

  updateLegal: asyncHandler(async (req: Request, res: Response) => {
    const input = legalUpdateSchema.parse(req.body);
    res.json(await SettingsAdminService.updateLegal(actorId(req), docType(req), input));
  }),
};
