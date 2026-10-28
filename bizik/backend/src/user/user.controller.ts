import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { WhatsAppChannelService } from '../whatsapp/whatsapp-channel.service';
import { UserService } from './user.service';
import { lookupSchema, updateProfileSchema } from './user.validation';

const userId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

export const UserController = {
  me: asyncHandler(async (req: Request, res: Response) => {
    res.json(await UserService.getMe(userId(req)));
  }),

  updateMe: asyncHandler(async (req: Request, res: Response) => {
    const input = updateProfileSchema.parse(req.body);
    res.json(await UserService.updateMe(userId(req), input));
  }),

  // ---- The user's own WhatsApp channel controls (Settings -> Security) ----
  whatsappStatus: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WhatsAppChannelService.status(userId(req)));
  }),

  lockWhatsapp: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WhatsAppChannelService.lock(userId(req)));
  }),

  /** The only way to release a locked channel - chat can lock, only the app unlocks. */
  unlockWhatsapp: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WhatsAppChannelService.unlock(userId(req)));
  }),

  resetWhatsappPin: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WhatsAppChannelService.resetPin(userId(req)));
  }),

  setWhatsappOptIn: asyncHandler(async (req: Request, res: Response) => {
    const optIn = req.body?.optIn !== false;
    res.json(await WhatsAppChannelService.setOptIn(userId(req), optIn));
  }),

  lookup: asyncHandler(async (req: Request, res: Response) => {
    const input = lookupSchema.parse({ email: req.query.email, phone: req.query.phone });
    res.json(await UserService.lookup(userId(req), input));
  }),
};
