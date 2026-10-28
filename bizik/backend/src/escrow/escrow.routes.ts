import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { EscrowController } from './escrow.controller';

const router = Router();

// SRS MOD-05 - escrow funding & release.
router.get('/milestones/:milestoneId/funding-quote', requireAuth, EscrowController.fundingQuote);
router.post('/milestones/:milestoneId/fund', requireAuth, EscrowController.fundMilestone);
router.post('/milestones/:milestoneId/fund-from-number', requireAuth, EscrowController.fundFromNumber);
router.post('/milestones/:milestoneId/release', requireAuth, EscrowController.releaseMilestone);
router.post('/milestones/:milestoneId/dispute', requireAuth, EscrowController.fileDispute);
router.post('/milestones/:milestoneId/cancel', requireAuth, EscrowController.cancelMilestone);
router.post('/contract/:contractId/cancel', requireAuth, EscrowController.cancel);
router.get('/contract/:contractId', requireAuth, EscrowController.summary);

// Inspection-period auto-release: cron-equivalent, also manually triggerable.
// Releases escrowed money in bulk: gate it on the real permission, not on the
// token's role claim (every operator carries role 'ADMIN').
router.post('/run-auto-release', requireAuth, requirePermission('escrow.manage'), EscrowController.runAutoRelease);

export default router;
