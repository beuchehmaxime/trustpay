import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware';
import { sensitiveLimiter } from '../../middleware/rate-limit';
import { PaymentController } from './payment.controller';
import { PaymentWebhookController } from './payment-webhook.controller';

const router = Router();

// --- Provider webhooks (unauthenticated - called by the provider) ---
router.post('/webhooks/mtn', PaymentWebhookController.mtn);
router.post('/webhooks/orange', PaymentWebhookController.orange);
router.post('/webhooks/fapshi', PaymentWebhookController.fapshi);

// --- User-initiated payments (authenticated) ---
// Money-movement init gets the stricter per-IP limiter (payment-spam / abuse).
router.post('/deposits', requireAuth, sensitiveLimiter, PaymentController.createDeposit);
router.post('/withdrawals', requireAuth, sensitiveLimiter, PaymentController.createWithdrawal);
router.get('/transactions/:id', requireAuth, PaymentController.getTransaction);

export default router;

