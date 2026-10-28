import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { DisputeController } from './dispute.controller';

const router = Router();

// SRS MOD-07 - disputes the signed-in user is a party to (filing happens at
// POST /escrow/milestones/:id/dispute).
router.get('/', requireAuth, DisputeController.list);
router.get('/:id', requireAuth, DisputeController.byId);
router.post('/:id/messages', requireAuth, DisputeController.message);
router.post('/:id/evidence', requireAuth, DisputeController.addEvidence);
router.post('/:id/resolve', requireAuth, DisputeController.resolve);
router.post('/:id/withdraw', requireAuth, DisputeController.withdraw);

export default router;
