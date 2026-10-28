import { Request, Response } from 'express';

import { asyncHandler } from '../lib/errors';
import { UserAdminService } from './useradmin.service';
import { listUsersQuerySchema } from './useradmin.validation';

export const UserAdminController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const filters = listUsersQuerySchema.parse(req.query);
    res.json(await UserAdminService.list(filters));
  }),

  stats: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await UserAdminService.stats());
  }),

  detail: asyncHandler(async (req: Request, res: Response) => {
    res.json(await UserAdminService.detail(req.params.id));
  }),

  projects: asyncHandler(async (req: Request, res: Response) => {
    res.json(await UserAdminService.recentProjects(req.params.id));
  }),

  reviews: asyncHandler(async (req: Request, res: Response) => {
    res.json(await UserAdminService.reviews(req.params.id));
  }),

  suspend: asyncHandler(async (req: Request, res: Response) => {
    res.json(await UserAdminService.suspend(req.params.id));
  }),

  reactivate: asyncHandler(async (req: Request, res: Response) => {
    res.json(await UserAdminService.reactivate(req.params.id));
  }),

  freeze: asyncHandler(async (req: Request, res: Response) => {
    res.json(await UserAdminService.freeze(req.params.id));
  }),

  unfreeze: asyncHandler(async (req: Request, res: Response) => {
    res.json(await UserAdminService.unfreeze(req.params.id));
  }),

  resetTwoFactor: asyncHandler(async (req: Request, res: Response) => {
    res.json(await UserAdminService.resetTwoFactor(req.params.id));
  }),

  forceLogout: asyncHandler(async (req: Request, res: Response) => {
    res.json(await UserAdminService.forceLogout(req.params.id));
  }),

  deleteReview: asyncHandler(async (req: Request, res: Response) => {
    res.json(await UserAdminService.deleteReview(req.params.id));
  }),
};
