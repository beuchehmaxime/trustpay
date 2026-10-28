import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { NotificationController } from './notification.controller';

const router = Router();

// SRS MOD-08 - notifications + per-category/channel preferences.
router.get('/', requireAuth, NotificationController.list);
router.get('/unread-count', requireAuth, NotificationController.unreadCount);
router.post('/read-all', requireAuth, NotificationController.markAllRead);
router.post('/:id/read', requireAuth, NotificationController.markRead);
router.get('/preferences', requireAuth, NotificationController.getPreferences);
router.put('/preferences', requireAuth, NotificationController.updatePreferences);
router.post('/push-token', requireAuth, NotificationController.registerPushToken);

export default router;
