import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { SupportAdminController } from './supportadmin.controller';

const router = Router();

// Support console (SRS MOD-13). Viewing tickets/help needs `support.view`;
// replying, changing status/priority, assigning and editing help content need
// `support.manage`. The super-admin role holds them all.
router.get('/support/tickets', requireAuth, requirePermission('support.view'), SupportAdminController.list);
router.get('/support/stats', requireAuth, requirePermission('support.view'), SupportAdminController.stats);
router.get('/support/tickets/:id', requireAuth, requirePermission('support.view'), SupportAdminController.detail);
router.post('/support/tickets/:id/reply', requireAuth, requirePermission('support.manage'), SupportAdminController.reply);
router.put('/support/tickets/:id/status', requireAuth, requirePermission('support.manage'), SupportAdminController.setStatus);
router.put('/support/tickets/:id/priority', requireAuth, requirePermission('support.manage'), SupportAdminController.setPriority);
router.post('/support/tickets/:id/assign', requireAuth, requirePermission('support.manage'), SupportAdminController.assign);

// Help center content
router.get('/support/help', requireAuth, requirePermission('support.view'), SupportAdminController.listArticles);
router.post('/support/help', requireAuth, requirePermission('support.manage'), SupportAdminController.createArticle);
router.put('/support/help/:id', requireAuth, requirePermission('support.manage'), SupportAdminController.updateArticle);
router.delete('/support/help/:id', requireAuth, requirePermission('support.manage'), SupportAdminController.deleteArticle);

export default router;
