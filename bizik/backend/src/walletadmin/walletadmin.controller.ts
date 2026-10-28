import { z } from 'zod';
import { Request, Response } from 'express';
import { Currency, PayoutStatus, WalletStatus, WalletTxType } from '@prisma/client';

import { AppError, asyncHandler } from '../lib/errors';
import { WalletAdminService } from './walletadmin.service';
import { rejectPayoutSchema } from './walletadmin.validation';

const adminId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const WALLET_STATUS = new Set<WalletStatus>(['ACTIVE', 'FROZEN', 'CLOSED']);
const PAYOUT_STATUS = new Set<PayoutStatus>([
  'INITIATED',
  'PROCESSING',
  'ON_HOLD',
  'COMPLETED',
  'FAILED',
]);
const CURRENCY = new Set<Currency>(['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF']);
const WALLET_TX_TYPE = new Set<WalletTxType>([
  'DEPOSIT',
  'WITHDRAWAL',
  'ESCROW_HOLD',
  'FEE',
  'REFUND',
  'FX_IN',
  'FX_OUT',
  'ADJUSTMENT',
]);

const asEnum = <T>(raw: unknown, allowed: Set<T>): T | undefined => {
  const value = String(raw ?? '').toUpperCase() as T;
  return allowed.has(value) ? value : undefined;
};
const paging = (req: Request) => ({
  page: Math.max(1, Number(req.query.page) || 1),
  pageSize: Math.min(100, Math.max(1, Number(req.query.pageSize) || 20)),
});

/** The operator records where they actually sent the money. */
const markPaidSchema = z.object({ reference: z.string().trim().min(3).max(120) });

export const WalletAdminController = {
  listWallets: asyncHandler(async (req: Request, res: Response) => {
    const { page, pageSize } = paging(req);
    res.json(
      await WalletAdminService.listWallets(
        {
          status: asEnum(req.query.status, WALLET_STATUS),
          currency: asEnum(req.query.currency, CURRENCY),
          search: req.query.search ? String(req.query.search) : undefined,
        },
        page,
        pageSize,
      ),
    );
  }),

  walletStats: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await WalletAdminService.walletStats());
  }),

  walletDetail: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WalletAdminService.walletDetail(req.params.id));
  }),

  listWalletTransactions: asyncHandler(async (req: Request, res: Response) => {
    const { page, pageSize } = paging(req);
    const direction = String(req.query.direction ?? '').toLowerCase();
    res.json(
      await WalletAdminService.walletTransactions(
        {
          type: asEnum(req.query.type, WALLET_TX_TYPE),
          currency: asEnum(req.query.currency, CURRENCY),
          direction: direction === 'in' || direction === 'out' ? direction : undefined,
          search: req.query.search ? String(req.query.search) : undefined,
        },
        page,
        pageSize,
      ),
    );
  }),

  walletTransactionDetail: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WalletAdminService.walletTransactionDetail(req.params.id));
  }),

  listPayouts: asyncHandler(async (req: Request, res: Response) => {
    const { page, pageSize } = paging(req);
    res.json(
      await WalletAdminService.listPayouts(
        {
          status: asEnum(req.query.status, PAYOUT_STATUS),
          currency: asEnum(req.query.currency, CURRENCY),
          search: req.query.search ? String(req.query.search) : undefined,
        },
        page,
        pageSize,
      ),
    );
  }),

  payoutStats: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await WalletAdminService.payoutStats());
  }),

  approve: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WalletAdminService.approve(adminId(req), req.params.id));
  }),

  hold: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WalletAdminService.hold(adminId(req), req.params.id));
  }),

  retry: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WalletAdminService.retry(adminId(req), req.params.id));
  }),

  reject: asyncHandler(async (req: Request, res: Response) => {
    const { reason } = rejectPayoutSchema.parse(req.body);
    res.json(await WalletAdminService.reject(adminId(req), req.params.id, reason));
  }),

  listWithdrawalHolds: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await WalletAdminService.listWithdrawalHolds());
  }),

  approveWithdrawalHold: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WalletAdminService.approveWithdrawalHold(adminId(req), req.params.id));
  }),

  markWithdrawalPaid: asyncHandler(async (req: Request, res: Response) => {
    const { reference } = markPaidSchema.parse(req.body);
    res.json(await WalletAdminService.markWithdrawalPaid(adminId(req), req.params.id, reference));
  }),

  payoutRailStatus: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await WalletAdminService.payoutRailStatus());
  }),

  rejectWithdrawalHold: asyncHandler(async (req: Request, res: Response) => {
    const { reason } = rejectPayoutSchema.parse(req.body);
    res.json(await WalletAdminService.rejectWithdrawalHold(adminId(req), req.params.id, reason));
  }),
};
