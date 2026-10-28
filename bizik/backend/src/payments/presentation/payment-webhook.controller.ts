import { Request, Response } from 'express';

import { asyncHandler } from '../../lib/errors';
import { PaymentWebhookService } from '../application/payment-webhook.service';

/**
 * Provider callbacks. These endpoints are unauthenticated (the provider calls
 * them) and must ALWAYS answer 200 quickly so the provider doesn't hammer us
 * with retries - any processing error is logged and left for reconciliation to
 * settle. The controller stays thin: no wallet logic here.
 */
export const PaymentWebhookController = {
  mtn: asyncHandler(async (req: Request, res: Response) => {
    try {
      await PaymentWebhookService.process('MTN_MOBILE_MONEY', req.body);
    } catch (error) {
      console.error('[webhook:mtn] processing failed:', (error as Error).message);
    }
    res.status(200).json({ success: true });
  }),

  orange: asyncHandler(async (req: Request, res: Response) => {
    try {
      await PaymentWebhookService.process('ORANGE_MONEY', req.body);
    } catch (error) {
      console.error('[webhook:orange] processing failed:', (error as Error).message);
    }
    res.status(200).json({ success: true });
  }),

  fapshi: asyncHandler(async (req: Request, res: Response) => {
    try {
      const secretHeader = req.header('x-wh-secret') ?? undefined;
      await PaymentWebhookService.processFapshi(secretHeader, req.body);
    } catch (error) {
      console.error('[webhook:fapshi] processing failed:', (error as Error).message);
    }
    res.status(200).json({ success: true });
  }),
};
