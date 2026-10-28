import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { UserAdminController } from './useradmin.controller';

const router = Router();

// Admin "Users & accounts" module (mounted at /api/v1/admin). Every action is
// gated by an RBAC permission; the super-admin role holds them all.

router.get('/users', requireAuth, requirePermission('users.view'), UserAdminController.list);
// Static path must precede the ":id" route so "stats" isn't parsed as an id.
router.get('/users/stats', requireAuth, requirePermission('users.view'), UserAdminController.stats);
router.get('/users/:id', requireAuth, requirePermission('users.view'), UserAdminController.detail);
router.get('/users/:id/projects', requireAuth, requirePermission('users.view'), UserAdminController.projects);
router.get(
  '/users/:id/reviews',
  requireAuth,
  requirePermission('reviews.moderate'),
  UserAdminController.reviews,
);

// Account status
router.post('/users/:id/suspend', requireAuth, requirePermission('users.suspend'), UserAdminController.suspend);
router.post('/users/:id/reactivate', requireAuth, requirePermission('users.suspend'), UserAdminController.reactivate);
router.post('/users/:id/freeze', requireAuth, requirePermission('accounts.freeze'), UserAdminController.freeze);
router.post('/users/:id/unfreeze', requireAuth, requirePermission('accounts.freeze'), UserAdminController.unfreeze);

// Security
router.post('/users/:id/reset-2fa', requireAuth, requirePermission('users.manage'), UserAdminController.resetTwoFactor);
router.post('/users/:id/force-logout', requireAuth, requirePermission('users.manage'), UserAdminController.forceLogout);

// Reviews moderation
router.delete('/reviews/:id', requireAuth, requirePermission('reviews.moderate'), UserAdminController.deleteReview);

export default router;
