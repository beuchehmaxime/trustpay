import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { AuditAdminController } from './auditadmin.controller';

const router = Router();

// SRS FR-ADM-006 - immutable audit log. Read-only; viewing (and exporting)
// requires `audit.view`. The super-admin role holds it.
router.get('/audit', requireAuth, requirePermission('audit.view'), AuditAdminController.list);
router.get('/audit/filters', requireAuth, requirePermission('audit.view'), AuditAdminController.filters);

export default router;
