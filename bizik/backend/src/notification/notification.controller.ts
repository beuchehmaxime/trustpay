import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { NotificationService } from './notification.service';
import {
  registerPushTokenSchema,
  updatePreferencesSchema,
} from './notification.validation';

const userId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

export const NotificationController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json(await NotificationService.list(userId(req)));
  }),

  unreadCount: asyncHandler(async (req: Request, res: Response) => {
    res.json(await NotificationService.unreadCount(userId(req)));
  }),

  markRead: asyncHandler(async (req: Request, res: Response) => {
    res.json(await NotificationService.markRead(userId(req), req.params.id));
  }),

  markAllRead: asyncHandler(async (req: Request, res: Response) => {
    res.json(await NotificationService.markAllRead(userId(req)));
  }),

  getPreferences: asyncHandler(async (req: Request, res: Response) => {
    res.json(await NotificationService.getPreferences(userId(req)));
  }),

  updatePreferences: asyncHandler(async (req: Request, res: Response) => {
    const input = updatePreferencesSchema.parse(req.body);
    res.json(await NotificationService.updatePreferences(userId(req), input));
  }),

  registerPushToken: asyncHandler(async (req: Request, res: Response) => {
    const input = registerPushTokenSchema.parse(req.body);
    res.json(await NotificationService.registerPushToken(userId(req), input));
  }),
};
