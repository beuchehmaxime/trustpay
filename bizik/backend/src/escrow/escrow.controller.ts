import { z } from 'zod';
import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { EscrowService } from './escrow.service';
import { cancelSchema, disputeSchema, fundSchema } from './escrow.validation';

const userId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};


/** Body of POST /escrow/milestones/:id/fund-from-number. */
const fundFromNumberSchema = z
  .object({
    payoutMethodId: z.string().min(1).max(64).optional(),
    phoneNumber: z.string().min(6).max(20).optional(),
    provider: z.enum(['MTN_MOBILE_MONEY', 'ORANGE_MONEY']).optional(),
  })
  .refine((body) => !!body.payoutMethodId || (!!body.phoneNumber && !!body.provider), {
    message: 'Provide a saved method, or a provider and phone number.',
  });

export const EscrowController = {
  /** Charge a Mobile Money number directly to fund a milestone (async pay-in). */
  fundFromNumber: asyncHandler(async (req: Request, res: Response) => {
    // Parsed, not cast: this reaches the live mobile-money rail, so an
    // unrecognised provider or an unbounded phone number must be rejected here
    // rather than after a PaymentTransaction row has been created.
    const body = fundFromNumberSchema.parse(req.body ?? {});
    res.json(await EscrowService.fundFromNumber(userId(req), req.params.milestoneId, body));
  }),

  /** What funding this milestone costs the payer, before they commit to it. */
  fundingQuote: asyncHandler(async (req: Request, res: Response) => {
    res.json(await EscrowService.fundingQuote(userId(req), req.params.milestoneId));
  }),

  fundMilestone: asyncHandler(async (req: Request, res: Response) => {
    const input = fundSchema.parse(req.body ?? {});
    res.json(await EscrowService.fundMilestone(userId(req), req.params.milestoneId, input));
  }),

  releaseMilestone: asyncHandler(async (req: Request, res: Response) => {
    res.json(await EscrowService.release(userId(req), req.params.milestoneId));
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const { reason } = cancelSchema.parse(req.body ?? {});
    res.json(await EscrowService.cancel(userId(req), req.params.contractId, reason));
  }),

  cancelMilestone: asyncHandler(async (req: Request, res: Response) => {
    res.json(await EscrowService.cancelMilestone(userId(req), req.params.milestoneId));
  }),

  fileDispute: asyncHandler(async (req: Request, res: Response) => {
    const input = disputeSchema.parse(req.body);
    res.json(await EscrowService.fileDispute(userId(req), req.params.milestoneId, input));
  }),

  summary: asyncHandler(async (req: Request, res: Response) => {
    res.json(await EscrowService.summary(userId(req), req.params.contractId));
  }),

  runAutoRelease: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await EscrowService.tickAutoReleases());
  }),
};
