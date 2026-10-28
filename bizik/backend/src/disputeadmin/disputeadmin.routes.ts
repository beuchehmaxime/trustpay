import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { DisputeAdminController } from './disputeadmin.controller';

const router = Router();

// SRS MOD-11 - Dispute mediation. Viewing needs `disputes.view`; assigning a
// mediator / escalating needs `disputes.assign`; messaging in mediation and
// issuing a binding ruling need `disputes.resolve`. Super-admin holds them all.

// Specific paths before `/disputes/:id`.
router.get('/disputes', requireAuth, requirePermission('disputes.view'), DisputeAdminController.list);
router.get('/disputes/stats', requireAuth, requirePermission('disputes.view'), DisputeAdminController.stats);
router.get('/disputes/mediators', requireAuth, requirePermission('disputes.view'), DisputeAdminController.mediators);
router.get('/disputes/:id', requireAuth, requirePermission('disputes.view'), DisputeAdminController.detail);

router.post('/disputes/:id/assign', requireAuth, requirePermission('disputes.assign'), DisputeAdminController.assign);
router.post('/disputes/:id/escalate', requireAuth, requirePermission('disputes.assign'), DisputeAdminController.escalate);
router.post('/disputes/:id/message', requireAuth, requirePermission('disputes.resolve'), DisputeAdminController.message);
router.post('/disputes/:id/rule', requireAuth, requirePermission('disputes.resolve'), DisputeAdminController.rule);

export default router;
