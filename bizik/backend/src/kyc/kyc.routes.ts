import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { KycController } from './kyc.controller';

const router = Router();

// SRS MOD-02 - identity verification for the signed-in user.
router.get('/status', requireAuth, KycController.status);
router.post('/submit', requireAuth, KycController.submit);

export default router;
