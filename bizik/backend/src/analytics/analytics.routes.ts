import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { AnalyticsController } from './analytics.controller';
import { BusinessAnalyticsController } from './business.controller';

const router = Router();

// SRS MOD-12 - Reports & analytics. Viewing analytics + report history needs
// `reports.view`; generating/exporting a report needs `reports.export`. The
// super-admin role holds them all.
router.get('/analytics/overview', requireAuth, requirePermission('reports.view'), AnalyticsController.overview);
router.get('/analytics/reports', requireAuth, requirePermission('reports.view'), AnalyticsController.reports);
router.post('/analytics/reports', requireAuth, requirePermission('reports.export'), AnalyticsController.generate);

// ---- Business analytics ----
// Split three ways by sensitivity rather than gated behind one permission.
// Someone working on growth needs the funnel and should not need the P&L to get
// it; someone reading the P&L has no reason to be able to change what the month
// cost. Each endpoint asks for the narrowest thing that lets it answer.
router.get(
  '/analytics/product',
  requireAuth,
  requirePermission('analytics.product'),
  BusinessAnalyticsController.product,
);
router.get(
  '/analytics/financial',
  requireAuth,
  requirePermission('analytics.financial'),
  BusinessAnalyticsController.financial,
);
router.get(
  '/analytics/costs',
  requireAuth,
  requirePermission('analytics.financial'),
  BusinessAnalyticsController.listCosts,
);
// Writing a cost changes the profit figure the business is run on, so it is a
// separate grant from reading one, and audited.
router.post(
  '/analytics/costs',
  requireAuth,
  requirePermission('analytics.costs'),
  BusinessAnalyticsController.upsertCost,
);
router.delete(
  '/analytics/costs/:id',
  requireAuth,
  requirePermission('analytics.costs'),
  BusinessAnalyticsController.deleteCost,
);

export default router;
