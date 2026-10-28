import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { SupportController } from './support.controller';

const router = Router();

// User-facing help desk (SRS MOD-13). All routes require a signed-in user;
// ticket access is scoped to the owner inside the service.
router.get('/help', requireAuth, SupportController.help);
router.get('/tickets', requireAuth, SupportController.listMine);
router.post('/tickets', requireAuth, SupportController.create);
router.get('/tickets/:id', requireAuth, SupportController.detail);
router.post('/tickets/:id/reply', requireAuth, SupportController.reply);

export default router;
