import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { signReceiptToken, verifyReceiptToken } from '../lib/jwt';
import { NudgeService } from '../reminder/nudge.service';
import { DealDocumentService } from './deal-document.service';
import { ContractService } from './contract.service';
import {
  addMilestoneSchema,
  createProjectSchema,
  editCounterpartySchema,
  editMilestoneSchema,
  revisionSchema,
  submitWorkSchema,
} from './contract.validation';

const userId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

export const ContractController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createProjectSchema.parse(req.body);
    res.status(201).json(await ContractService.create(userId(req), input));
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ContractService.list(userId(req)));
  }),

  byId: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ContractService.byId(userId(req), req.params.id));
  }),

  decline: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ContractService.decline(userId(req), req.params.id));
  }),

  /** Creator cancels their own deal (only while nothing has been funded). */
  cancel: asyncHandler(async (req: Request, res: Response) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    res.json(await ContractService.cancel(userId(req), req.params.id, reason));
  }),

  /** Creator cancels ONE unfunded milestone of their deal. */
  cancelMilestone: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ContractService.cancelMilestone(userId(req), req.params.milestoneId));
  }),

  /**
   * Remind the other party about whatever this deal is waiting on (fund it,
   * deliver it, approve it, accept the invite). Either side may send it.
   */
  remind: asyncHandler(async (req: Request, res: Response) => {
    res.json(await NudgeService.remind(userId(req), req.params.id));
  }),

  /** Short-lived token so the document can be opened outside the app. */
  receiptToken: asyncHandler(async (req: Request, res: Response) => {
    // Proves the caller is a party before handing out a token for this deal.
    await DealDocumentService.receipt(userId(req), req.params.id);
    res.json({ token: signReceiptToken(userId(req), req.params.id) });
  }),

  /** Stream the deal document. Auth via the receipt token (no session header). */
  receipt: asyncHandler(async (req: Request, res: Response) => {
    const rawToken = String(req.query.rt ?? '');
    if (!rawToken) throw new AppError(401, 'Q-401', 'A receipt token is required.');
    let claims: { userId: string; reference: string };
    try {
      claims = verifyReceiptToken(rawToken);
    } catch {
      throw new AppError(401, 'Q-401', 'This link has expired. Please reopen it.');
    }
    if (claims.reference !== req.params.id) {
      throw new AppError(403, 'Q-403', 'This token does not match the deal.');
    }
    const { pdf, fileName } = await DealDocumentService.receipt(claims.userId, claims.reference);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(Buffer.from(pdf));
  }),

  accept: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ContractService.accept(userId(req), req.params.id));
  }),

  editCounterparty: asyncHandler(async (req: Request, res: Response) => {
    const input = editCounterpartySchema.parse(req.body);
    res.json(await ContractService.editCounterparty(userId(req), req.params.id, input));
  }),

  submitWork: asyncHandler(async (req: Request, res: Response) => {
    const input = submitWorkSchema.parse(req.body ?? {});
    res.json(await ContractService.submitWork(userId(req), req.params.milestoneId, input));
  }),

  requestRevision: asyncHandler(async (req: Request, res: Response) => {
    const input = revisionSchema.parse(req.body);
    res.json(await ContractService.requestRevision(userId(req), req.params.milestoneId, input));
  }),

  addMilestone: asyncHandler(async (req: Request, res: Response) => {
    const input = addMilestoneSchema.parse(req.body);
    res.status(201).json(await ContractService.addMilestone(userId(req), req.params.id, input));
  }),

  editMilestone: asyncHandler(async (req: Request, res: Response) => {
    const input = editMilestoneSchema.parse(req.body);
    res.json(await ContractService.editMilestone(userId(req), req.params.milestoneId, input));
  }),

  deleteMilestone: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ContractService.deleteMilestone(userId(req), req.params.milestoneId));
  }),

  deleteProject: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ContractService.deleteProject(userId(req), req.params.id));
  }),

  completeProject: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ContractService.completeProject(userId(req), req.params.id));
  }),
};
