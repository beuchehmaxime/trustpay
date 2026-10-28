import { Router } from 'express';

import { optionalAuth } from '../middleware/auth.middleware';
import { BusinessAnalyticsController } from './business.controller';

/**
 * Visitor event ingest.
 *
 * Public, because most of the funnel happens before anyone has an account and a
 * measurement that only sees signed-in people cannot show where the rest went.
 *
 * `optionalAuth` rather than `requireAuth`: a signed-in visitor's events get
 * their user id attached, which is what joins "visits" to "accounts", while an
 * anonymous one is still recorded. The user id is taken from the verified
 * session and never from the request body, because a visitor id is
 * self-asserted and a user id must not be.
 */
const router = Router();

router.post('/', optionalAuth, BusinessAnalyticsController.ingest);

export default router;
