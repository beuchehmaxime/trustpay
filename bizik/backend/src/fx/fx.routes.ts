import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { FxController } from './fx.controller';

const router = Router();

// SRS FR-PAY-009 - live conversion quote (mid-market + margin).
router.get('/rate', requireAuth, FxController.rate);

export default router;
