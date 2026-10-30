import { Request, Response } from 'express';
import { z } from 'zod';

import { AppError, asyncHandler } from '../lib/errors';
import { AssistantService } from './assistant.service';

/**
 * The in-app assistant's HTTP surface.
 *
 * Note what the confirm endpoint accepts: a proposal id and a PIN. It does not
 * accept an amount, a recipient or a tool name, because it does not need them -
 * the server already knows what it proposed. There is deliberately no shape of
 * request here that could carry a different action than the one the user was
 * shown.
 */

const userId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
});

const confirmSchema = z.object({
  proposalId: z.string().min(1),
  // Never logged, never stored, never echoed back.
  pin: z.string().regex(/^\d{4,6}$/).optional(),
});

const cancelSchema = z.object({
  proposalId: z.string().min(1),
});

const pinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'Your PIN must be 4 to 6 digits.'),
});

export const AssistantController = {
  /** Whether the panel should show itself at all. */
  status: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ available: AssistantService.available() });
  }),

  history: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AssistantService.history(userId(req)));
  }),

  chat: asyncHandler(async (req: Request, res: Response) => {
    const { message } = chatSchema.parse(req.body);
    res.json(await AssistantService.chat(userId(req), message));
  }),

  confirm: asyncHandler(async (req: Request, res: Response) => {
    const { proposalId, pin } = confirmSchema.parse(req.body);
    res.json(await AssistantService.confirm(userId(req), proposalId, pin));
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const { proposalId } = cancelSchema.parse(req.body);
    res.json(await AssistantService.cancel(userId(req), proposalId));
  }),

  setPin: asyncHandler(async (req: Request, res: Response) => {
    const { pin } = pinSchema.parse(req.body);
    await AssistantService.setPin(userId(req), pin);
    res.status(204).send();
  }),

  reset: asyncHandler(async (req: Request, res: Response) => {
    await AssistantService.reset(userId(req));
    res.status(204).send();
  }),
};
