import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { AdminNotifyController } from './adminnotify.controller';

const router = Router();

// Operator notification inbox / bell. Every operator has an inbox, but its
// CONTENTS are RBAC-scoped inside the service (you only receive notifications
// for areas you hold permission over - super admins receive all).
router.get('/notifications/feed', requireAuth, AdminNotifyController.feed);
router.get('/notifications/unread-count', requireAuth, AdminNotifyController.unreadCount);
router.get('/notifications/stats', requireAuth, AdminNotifyController.stats);
router.get('/notifications', requireAuth, AdminNotifyController.list);
router.post('/notifications/read-all', requireAuth, AdminNotifyController.markAllRead);
router.post('/notifications/:id/read', requireAuth, AdminNotifyController.markRead);

// Broadcasts to end users - gated on `broadcasts.send`.
router.get(
  '/notifications/broadcasts',
  requireAuth,
  requirePermission('broadcasts.send'),
  AdminNotifyController.broadcasts,
);
router.get(
  '/notifications/audiences',
  requireAuth,
  requirePermission('broadcasts.send'),
  AdminNotifyController.audiences,
);
router.post(
  '/notifications/broadcasts',
  requireAuth,
  requirePermission('broadcasts.send'),
  AdminNotifyController.broadcast,
);
// Send the weekly project/transaction digest to all eligible users on demand.
router.post(
  '/notifications/weekly-digest/run',
  requireAuth,
  requirePermission('broadcasts.send'),
  AdminNotifyController.runWeeklyDigest,
);

// Notification templates - gated on `notifications.manage`.
router.get(
  '/notifications/templates',
  requireAuth,
  requirePermission('notifications.manage'),
  AdminNotifyController.templates,
);
router.put(
  '/notifications/templates/:key',
  requireAuth,
  requirePermission('notifications.manage'),
  AdminNotifyController.updateTemplate,
);
router.post(
  '/notifications/templates/:key/test',
  requireAuth,
  requirePermission('notifications.manage'),
  AdminNotifyController.testTemplate,
);

// In-contract message moderation - gated on `messages.moderate`.
router.get(
  '/notifications/moderation',
  requireAuth,
  requirePermission('messages.moderate'),
  AdminNotifyController.moderationQueue,
);
router.get(
  '/notifications/moderation/count',
  requireAuth,
  requirePermission('messages.moderate'),
  AdminNotifyController.moderationCount,
);
router.get(
  '/notifications/moderation/:id/thread',
  requireAuth,
  requirePermission('messages.moderate'),
  AdminNotifyController.moderationThread,
);
router.post(
  '/notifications/moderation/:id/remove',
  requireAuth,
  requirePermission('messages.moderate'),
  AdminNotifyController.removeMessage,
);
router.post(
  '/notifications/moderation/:id/dismiss',
  requireAuth,
  requirePermission('messages.moderate'),
  AdminNotifyController.dismissReport,
);

export default router;
