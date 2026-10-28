import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../lib/errors';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { DormancyAdminService } from './dormancy.admin.service';

/**
 * Dormant-account review and deletion.
 *
 * Both endpoints need `accounts.purge`, including the read. The list names
 * people who are about to lose their account along with their phone and email,
 * and that is not a page every operator needs to be able to open.
 */
const router = Router();

router.get(
  '/dormant-accounts',
  requireAuth,
  requirePermission('accounts.purge'),
  asyncHandler(async (_req, res) => {
    res.json(await DormancyAdminService.review());
  }),
);

const purgeSchema = z.object({
  // Named explicitly. There is no "delete everything eligible" shape, so the
  // set an operator confirmed on screen is exactly the set that is acted on.
  userIds: z.array(z.string().min(1)).min(1).max(500),
  password: z.string().min(1, 'Enter your password to confirm.'),
});

router.post(
  '/dormant-accounts/purge',
  requireAuth,
  requirePermission('accounts.purge'),
  asyncHandler(async (req, res) => {
    const input = purgeSchema.parse(req.body);
    res.json(
      await DormancyAdminService.purge(req.user!.id, input.password, input.userIds, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }),
    );
  }),
);

export default router;
