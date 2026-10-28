import { Request, Response } from 'express';

import type { Currency } from '@prisma/client';

import { AppError, asyncHandler } from '../lib/errors';
import { quoteProviderFee } from '../lib/provider-fees';
import { verifyReceiptToken } from '../lib/jwt';
import { WalletService } from './wallet.service';
import {
  addFundsSchema,
  addPayoutMethodSchema,
  convertSchema,
  payoutSchema,
  resendPayoutMethodOtpSchema,
  verifyPayoutMethodOtpSchema,
} from './wallet.validation';

/** Mobile-money types must go through the SMS-OTP verification flow. */
const MOMO_TYPES = new Set(['MTN_MOMO', 'ORANGE_MONEY']);

const userId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

export const WalletController = {
  overview: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WalletService.overview(userId(req)));
  }),

  transactions: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WalletService.transactions(userId(req)));
  }),

  /** Issue a short-lived token the client uses to open the receipt PDF in a browser. */
  receiptToken: asyncHandler(async (req: Request, res: Response) => {
    const token = await WalletService.issueReceiptToken(userId(req), req.params.reference);
    res.json({ token });
  }),

  /** Stream a transaction receipt PDF. Auth via the receipt token (no session header). */
  receipt: asyncHandler(async (req: Request, res: Response) => {
    const rawToken = String(req.query.rt ?? '');
    if (!rawToken) throw new AppError(401, 'Q-401', 'A receipt token is required.');
    let claims: { userId: string; reference: string };
    try {
      claims = verifyReceiptToken(rawToken);
    } catch {
      throw new AppError(401, 'Q-401', 'This receipt link has expired. Please reopen it.');
    }
    if (claims.reference !== req.params.reference) {
      throw new AppError(403, 'Q-403', 'This receipt token does not match the transaction.');
    }
    const { pdf, fileName } = await WalletService.buildReceipt(claims.userId, claims.reference);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(Buffer.from(pdf));
  }),

  // ---- Payout methods ----
  listPayoutMethods: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WalletService.listPayoutMethods(userId(req)));
  }),

  addPayoutMethod: asyncHandler(async (req: Request, res: Response) => {
    const input = addPayoutMethodSchema.parse(req.body);
    // A mobile-money number must be OTP-verified - never added directly here.
    if (MOMO_TYPES.has(input.type)) {
      throw new AppError(400, 'Q-400', 'Mobile Money numbers must be verified. Use the verification flow.');
    }
    res.status(201).json(await WalletService.addPayoutMethod(userId(req), input));
  }),

  /** Step 1: start adding a method - sends an SMS OTP for mobile money. */
  startPayoutMethodVerification: asyncHandler(async (req: Request, res: Response) => {
    const input = addPayoutMethodSchema.parse(req.body);
    res.status(201).json(await WalletService.startPayoutMethodVerification(userId(req), input));
  }),

  /** Step 2: confirm the SMS OTP and save the verified method. */
  verifyPayoutMethodOtp: asyncHandler(async (req: Request, res: Response) => {
    const input = verifyPayoutMethodOtpSchema.parse(req.body);
    res.status(201).json(
      await WalletService.verifyPayoutMethodOtp(userId(req), input.challengeId, input.code),
    );
  }),

  /** Resend a fresh SMS OTP to the pending number. */
  resendPayoutMethodOtp: asyncHandler(async (req: Request, res: Response) => {
    const input = resendPayoutMethodOtpSchema.parse(req.body);
    res.json(await WalletService.resendPayoutMethodOtp(userId(req), input.challengeId));
  }),

  removePayoutMethod: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WalletService.removePayoutMethod(userId(req), req.params.id));
  }),

  setDefaultPayoutMethod: asyncHandler(async (req: Request, res: Response) => {
    res.json(await WalletService.setDefaultPayoutMethod(userId(req), req.params.id));
  }),

  // ---- Top up / withdraw / convert ----
  /**
   * The cost of a movement before it happens: the amount, the rail's cut, and
   * what will actually be charged or debited. Read-only and cheap, so the
   * confirm screen can call it as the user types.
   */
  transferQuote: asyncHandler(async (req: Request, res: Response) => {
    const amount = Number(req.query.amount);
    const direction = req.query.direction === 'withdrawal' ? 'withdrawal' : 'deposit';
    const currency = typeof req.query.currency === 'string' ? req.query.currency : 'XAF';
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(400, 'Q-400', 'Enter an amount.');
    }
    res.json(quoteProviderFee(amount, direction, undefined, currency as Currency));
  }),

  addFunds: asyncHandler(async (req: Request, res: Response) => {
    const input = addFundsSchema.parse(req.body);
    res.json(await WalletService.addFunds(userId(req), input));
  }),

  payout: asyncHandler(async (req: Request, res: Response) => {
    const input = payoutSchema.parse(req.body);
    res.json(await WalletService.requestPayout(userId(req), input));
  }),

  convert: asyncHandler(async (req: Request, res: Response) => {
    const input = convertSchema.parse(req.body);
    res.json(await WalletService.convert(userId(req), input));
  }),
};
