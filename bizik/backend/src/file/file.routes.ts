import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { FileController } from './file.controller';

const router = Router();

// Stream a stored document (KYC ID/selfie, dispute evidence, …) to its owner
// or a privileged reviewer. Access control lives in the service layer.
router.get('/:id', requireAuth, FileController.download);

export default router;
