import { Request, Response } from 'express';
import { Currency, PaymentTransaction } from '@prisma/client';

import { config } from '../../config/env';
import { AppError, asyncHandler } from '../../lib/errors';
import { PaymentService } from '../application/payment.service';
import { createDepositSchema, createWithdrawalSchema } from './payment.validation';

const userId = (req: Request): string => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

/** Client-facing view of a provider payment transaction. */
function shape(paymentTransaction: PaymentTransaction) {
  return {
    id: paymentTransaction.id,
    reference: paymentTransaction.transactionReference,
    operation: paymentTransaction.operation,
    provider: paymentTransaction.provider,
    amount: Number(paymentTransaction.amount),
    currency: paymentTransaction.currency,
    status: paymentTransaction.status,
    failureReason: paymentTransaction.failureReason,
    createdAt: paymentTransaction.createdAt,
    completedAt: paymentTransaction.completedAt,
  };
}

export const PaymentController = {
  createDeposit: asyncHandler(async (req: Request, res: Response) => {
    const input = createDepositSchema.parse(req.body);
    const paymentTransaction = await PaymentService.createDeposit({
      userId: userId(req),
      amount: input.amount,
      currency: (input.currency ?? config.payments.defaultCurrency) as Currency,
      payoutMethodId: input.payoutMethodId,
      provider: input.provider,
      phoneNumber: input.phoneNumber,
    });
    res.status(201).json({ success: true, data: shape(paymentTransaction) });
  }),

  createWithdrawal: asyncHandler(async (req: Request, res: Response) => {
    const input = createWithdrawalSchema.parse(req.body);
    const paymentTransaction = await PaymentService.createWithdrawal({
      userId: userId(req),
      amount: input.amount,
      currency: (input.currency ?? config.payments.defaultCurrency) as Currency,
      payoutMethodId: input.payoutMethodId,
      provider: input.provider,
      phoneNumber: input.phoneNumber,
    });
    res.status(201).json({ success: true, data: shape(paymentTransaction) });
  }),

  getTransaction: asyncHandler(async (req: Request, res: Response) => {
    // Settles a still-processing payment live, so the app's poll resolves fast.
    const paymentTransaction = await PaymentService.getTransactionForUser(userId(req), req.params.id);
    res.json({ success: true, data: shape(paymentTransaction) });
  }),
};
