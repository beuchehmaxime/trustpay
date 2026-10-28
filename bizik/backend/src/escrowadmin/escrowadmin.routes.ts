import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { EscrowAdminController } from './escrowadmin.controller';

const router = Router();

// SRS MOD-07 - Escrow & transactions. Viewing needs `escrow.view`; manual
// release / refund / adjustment / reconciliation need `escrow.manage`. The
// super-admin role holds them all.

// Specific paths before `/escrow/accounts/:id`.
router.get('/escrow/accounts', requireAuth, requirePermission('escrow.view'), EscrowAdminController.listAccounts);
router.get('/escrow/stats', requireAuth, requirePermission('escrow.view'), EscrowAdminController.stats);
router.get('/escrow/ledger', requireAuth, requirePermission('escrow.view'), EscrowAdminController.ledger);
router.get(
  '/escrow/transactions/:id',
  requireAuth,
  requirePermission('escrow.view'),
  EscrowAdminController.transactionDetail,
);
router.get(
  '/escrow/accounts/:id',
  requireAuth,
  requirePermission('escrow.view'),
  EscrowAdminController.accountDetail,
);

router.post(
  '/escrow/milestones/:milestoneId/release',
  requireAuth,
  requirePermission('escrow.manage'),
  EscrowAdminController.releaseMilestone,
);
router.post(
  '/escrow/milestones/:milestoneId/refund',
  requireAuth,
  requirePermission('escrow.manage'),
  EscrowAdminController.refundMilestone,
);
router.post(
  '/escrow/accounts/:id/adjust',
  requireAuth,
  requirePermission('escrow.manage'),
  EscrowAdminController.adjust,
);
router.post(
  '/escrow/accounts/:id/reconcile',
  requireAuth,
  requirePermission('escrow.manage'),
  EscrowAdminController.reconcile,
);

export default router;
