import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { AdminController } from './admin.controller';

const router = Router();

// SRS MOD-09 - KYC review queue. Every action requires the matching RBAC
// permission; the super-admin role holds them all.
router.get('/kyc/queue', requireAuth, requirePermission('kyc.view'), AdminController.kycQueue);
router.get('/kyc/:id', requireAuth, requirePermission('kyc.view'), AdminController.kycDetail);
router.post('/kyc/:id/approve', requireAuth, requirePermission('kyc.approve'), AdminController.approve);
router.post('/kyc/:id/reject', requireAuth, requirePermission('kyc.reject'), AdminController.reject);
router.post(
  '/kyc/:id/request-docs',
  requireAuth,
  requirePermission('kyc.request_docs'),
  AdminController.requestDocuments,
);
router.post('/kyc/:id/escalate', requireAuth, requirePermission('kyc.escalate'), AdminController.escalate);

export default router;
