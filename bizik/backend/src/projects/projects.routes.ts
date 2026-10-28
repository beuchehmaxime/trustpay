import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { ProjectsController } from './projects.controller';

const router = Router();

// SRS MOD-05/06 - Projects & contracts oversight. Viewing needs `contracts.view`;
// force-cancel / force-complete need `contracts.manage`; templates need
// `templates.manage`. The super-admin role holds them all.

// Specific paths first so `/projects/:id` doesn't swallow stats/templates.
router.get('/projects', requireAuth, requirePermission('contracts.view'), ProjectsController.list);
router.get('/projects/stats', requireAuth, requirePermission('contracts.view'), ProjectsController.stats);
router.get(
  '/projects/templates',
  requireAuth,
  requirePermission('templates.manage'),
  ProjectsController.templates,
);
router.delete(
  '/projects/templates/:id',
  requireAuth,
  requirePermission('templates.manage'),
  ProjectsController.deleteTemplate,
);

router.get('/projects/:id', requireAuth, requirePermission('contracts.view'), ProjectsController.detail);
router.post(
  '/projects/:id/force-cancel',
  requireAuth,
  requirePermission('contracts.manage'),
  ProjectsController.forceCancel,
);
router.post(
  '/projects/:id/force-complete',
  requireAuth,
  requirePermission('contracts.manage'),
  ProjectsController.forceComplete,
);

export default router;
