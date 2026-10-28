import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { lookupLimiter } from '../middleware/rate-limit';
import { TransferController } from './transfer.controller';

/**
 * Wallet-to-wallet money movement between BiZik users, addressed by handle
 * (or phone). Escrow lives elsewhere - this is the direct, final kind.
 */
const router = Router();

router.get('/me', requireAuth, TransferController.me);
router.patch('/me/handle', requireAuth, TransferController.claimHandle);
// Turns a phone number or handle into a real name, so it is an identity
// oracle if left unthrottled.
router.get('/lookup', requireAuth, lookupLimiter, TransferController.lookup);
router.get('/', requireAuth, TransferController.list);
router.post('/', requireAuth, TransferController.send);
router.get('/:id', requireAuth, TransferController.byId);

export default router;
