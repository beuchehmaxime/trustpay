import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { SettingsAdminController } from './settingsadmin.controller';

const router = Router();

// System settings. Viewing needs `settings.view`; editing any group or legal
// document needs `settings.manage`. The super-admin role holds them all.
router.get('/settings', requireAuth, requirePermission('settings.view'), SettingsAdminController.overview);
router.get(
  '/settings/legal/:type',
  requireAuth,
  requirePermission('settings.view'),
  SettingsAdminController.legal,
);
router.put(
  '/settings/legal/:type',
  requireAuth,
  requirePermission('settings.manage'),
  SettingsAdminController.updateLegal,
);
router.put(
  '/settings/:group',
  requireAuth,
  requirePermission('settings.manage'),
  SettingsAdminController.updateGroup,
);

export default router;
