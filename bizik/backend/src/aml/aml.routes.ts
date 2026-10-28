import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { AmlController } from './aml.controller';

const router = Router();

// SRS MOD-10 - AML / sanctions case management. Viewing needs `aml.view`;
// case decisions need `aml.resolve`; freezing an account needs `accounts.freeze`.
// The super-admin role holds them all.
router.get('/aml/alerts', requireAuth, requirePermission('aml.view'), AmlController.list);
router.get('/aml/stats', requireAuth, requirePermission('aml.view'), AmlController.stats);
router.get('/aml/alerts/:id', requireAuth, requirePermission('aml.view'), AmlController.detail);
router.get(
  '/aml/alerts/:id/timeline',
  requireAuth,
  requirePermission('aml.view'),
  AmlController.timeline,
);
router.post(
  '/aml/alerts/:id/note',
  requireAuth,
  requirePermission('aml.resolve'),
  AmlController.addNote,
);

router.post(
  '/aml/alerts/:id/review',
  requireAuth,
  requirePermission('aml.resolve'),
  AmlController.review,
);
router.post(
  '/aml/alerts/:id/clear',
  requireAuth,
  requirePermission('aml.resolve'),
  AmlController.clear,
);
router.post(
  '/aml/alerts/:id/escalate',
  requireAuth,
  requirePermission('aml.resolve'),
  AmlController.escalate,
);
router.post(
  '/aml/alerts/:id/file-sar',
  requireAuth,
  requirePermission('aml.resolve'),
  AmlController.fileSar,
);
router.post(
  '/aml/alerts/:id/freeze',
  requireAuth,
  requirePermission('accounts.freeze'),
  AmlController.freeze,
);

export default router;
