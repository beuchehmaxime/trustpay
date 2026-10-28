import { Request, Response } from 'express';
import { Currency, EscrowAccountStatus, EscrowTxType, TxStatus } from '@prisma/client';

import { AppError, asyncHandler } from '../lib/errors';
import { EscrowAdminService } from './escrowadmin.service';
import { adjustSchema, refundSchema } from './escrowadmin.validation';

const adminId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const ACCOUNT_STATUS = new Set<EscrowAccountStatus>([
  'OPEN',
  'PARTIALLY_RELEASED',
  'RELEASED',
  'REFUNDED',
  'FROZEN',
  'CLOSED',
]);
const TX_TYPE = new Set<EscrowTxType>(['FUND', 'HOLD', 'RELEASE', 'REFUND', 'ADJUSTMENT']);
const TX_STATUS = new Set<TxStatus>(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED']);
const CURRENCY = new Set<Currency>(['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF']);

const asEnum = <T>(raw: unknown, allowed: Set<T>): T | undefined => {
  const value = String(raw ?? '').toUpperCase() as T;
  return allowed.has(value) ? value : undefined;
};
const paging = (req: Request) => ({
  page: Math.max(1, Number(req.query.page) || 1),
  pageSize: Math.min(100, Math.max(1, Number(req.query.pageSize) || 20)),
});

export const EscrowAdminController = {
  listAccounts: asyncHandler(async (req: Request, res: Response) => {
    const { page, pageSize } = paging(req);
    res.json(
      await EscrowAdminService.listAccounts(
        {
          status: asEnum(req.query.status, ACCOUNT_STATUS),
          currency: asEnum(req.query.currency, CURRENCY),
          search: req.query.search ? String(req.query.search) : undefined,
        },
        page,
        pageSize,
      ),
    );
  }),

  stats: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await EscrowAdminService.stats());
  }),

  ledger: asyncHandler(async (req: Request, res: Response) => {
    const { page, pageSize } = paging(req);
    res.json(
      await EscrowAdminService.ledger(
        {
          type: asEnum(req.query.type, TX_TYPE),
          status: asEnum(req.query.status, TX_STATUS),
          currency: asEnum(req.query.currency, CURRENCY),
        },
        page,
        pageSize,
      ),
    );
  }),

  transactionDetail: asyncHandler(async (req: Request, res: Response) => {
    res.json(await EscrowAdminService.transactionDetail(req.params.id));
  }),

  accountDetail: asyncHandler(async (req: Request, res: Response) => {
    res.json(await EscrowAdminService.accountDetail(req.params.id));
  }),

  releaseMilestone: asyncHandler(async (req: Request, res: Response) => {
    res.json(await EscrowAdminService.releaseMilestone(adminId(req), req.params.milestoneId));
  }),

  refundMilestone: asyncHandler(async (req: Request, res: Response) => {
    const { reason } = refundSchema.parse(req.body ?? {});
    res.json(await EscrowAdminService.refundMilestone(adminId(req), req.params.milestoneId, reason));
  }),

  adjust: asyncHandler(async (req: Request, res: Response) => {
    const { delta, note } = adjustSchema.parse(req.body);
    res.json(await EscrowAdminService.adjust(adminId(req), req.params.id, delta, note));
  }),

  reconcile: asyncHandler(async (req: Request, res: Response) => {
    res.json(await EscrowAdminService.reconcile(adminId(req), req.params.id));
  }),
};
