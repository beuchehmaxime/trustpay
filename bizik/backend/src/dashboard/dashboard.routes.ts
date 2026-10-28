import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { DashboardController } from './dashboard.controller';

const router = Router();

// Admin dashboard. Requires `dashboard.view`; individual cards, queues, charts
// and the activity feed are additionally scoped to the operator's permissions
// inside the service (you only receive data for areas you can access).
router.get('/dashboard', requireAuth, requirePermission('dashboard.view'), DashboardController.overview);

export default router;
