import { Request, Response } from 'express';
import { z } from 'zod';

import { AppError, asyncHandler } from '../lib/errors';
import { MAX_AUDIO_BYTES } from './assistant-voice';
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

// Base64 of a WAV. Length is checked on the decoded bytes rather than here,
// since base64 inflates by a third and a character count would be a confusing
// number to show anyone.
const voiceSchema = z.object({
  audio: z.string().min(1),
});

const pinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'Your PIN must be 4 to 6 digits.'),
});

export const AssistantController = {
  /** Whether the panel should show itself at all. */
  status: asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      available: AssistantService.available(),
      voice: AssistantService.voiceAvailable(),
    });
  }),

  /**
   * A voice note.
   *
   * The audio arrives base64 in JSON rather than as a multipart upload. The
   * clip is small, already in memory on the client, and this keeps it on the
   * same authenticated JSON path as everything else here - no new parser, no
   * temporary file, nothing written to disk at any point.
   */
  voice: asyncHandler(async (req: Request, res: Response) => {
    const { audio } = voiceSchema.parse(req.body);
    const bytes = Buffer.from(audio, 'base64');
    if (bytes.length === 0) throw new AppError(400, 'Q-400-AUDIO', 'That recording was empty.');
    if (bytes.length > MAX_AUDIO_BYTES) {
      throw new AppError(413, 'Q-413-AUDIO', 'That recording is too long. Keep it under two minutes.');
    }
    res.json(await AssistantService.voice(userId(req), bytes));
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
