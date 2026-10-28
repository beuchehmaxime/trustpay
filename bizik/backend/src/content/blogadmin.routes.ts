import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { BlogAdminController } from './blogadmin.controller';

/**
 * Admin blog authoring. Viewing needs `support.view`; creating/editing/deleting
 * needs `support.manage` - the same content-management permissions that gate the
 * help centre. Mounted at /api/v1/admin.
 */
const router = Router();

router.get('/blog', requireAuth, requirePermission('support.view'), BlogAdminController.list);
router.get('/blog/:id', requireAuth, requirePermission('support.view'), BlogAdminController.detail);
router.post('/blog', requireAuth, requirePermission('support.manage'), BlogAdminController.create);
router.put('/blog/:id', requireAuth, requirePermission('support.manage'), BlogAdminController.update);
router.delete('/blog/:id', requireAuth, requirePermission('support.manage'), BlogAdminController.remove);

export default router;
