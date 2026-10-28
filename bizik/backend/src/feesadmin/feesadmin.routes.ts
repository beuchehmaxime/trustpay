import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { FeesAdminController } from './feesadmin.controller';

const router = Router();

// SRS pricing - Fees & FX. Viewing needs `fees.view`; editing fees or FX rates
// needs `fees.manage`. The super-admin role holds them all.
router.get('/fees/config', requireAuth, requirePermission('fees.view'), FeesAdminController.config);
router.put('/fees/config', requireAuth, requirePermission('fees.manage'), FeesAdminController.updateFees);
router.put(
  '/fees/fx/:currency',
  requireAuth,
  requirePermission('fees.manage'),
  FeesAdminController.updateFxRate,
);

export default router;
