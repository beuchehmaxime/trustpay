import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { RbacController } from './rbac.controller';

const router = Router();

// RBAC administration (mounted at /api/v1/admin). Every action is gated by a
// permission; the super-admin role holds them all.

// Permission catalog (needed to render the role editor).
router.get('/permissions', requireAuth, requirePermission('roles.view'), RbacController.permissions);

// Roles
router.get('/roles', requireAuth, requirePermission('roles.view'), RbacController.listRoles);
router.post('/roles', requireAuth, requirePermission('roles.manage'), RbacController.createRole);
router.patch('/roles/:id', requireAuth, requirePermission('roles.manage'), RbacController.updateRole);
router.delete('/roles/:id', requireAuth, requirePermission('roles.manage'), RbacController.deleteRole);

// Platform operators
router.get('/operators', requireAuth, requirePermission('operators.view'), RbacController.listOperators);
router.post('/operators', requireAuth, requirePermission('operators.manage'), RbacController.createOperator);
router.patch('/operators/:id', requireAuth, requirePermission('operators.manage'), RbacController.updateOperator);

export default router;
