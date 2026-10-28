import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { lookupLimiter } from '../middleware/rate-limit';
import { UserController } from './user.controller';

const router = Router();

// The signed-in user's own account/profile.
router.get('/me', requireAuth, UserController.me);
router.patch('/me', requireAuth, UserController.updateMe);

// The user's own WhatsApp channel: see it, lock/unlock it, reset its PIN,
// and turn proactive messages on/off.
router.get('/me/whatsapp', requireAuth, UserController.whatsappStatus);
router.post('/me/whatsapp/lock', requireAuth, UserController.lockWhatsapp);
router.post('/me/whatsapp/unlock', requireAuth, UserController.unlockWhatsapp);
router.post('/me/whatsapp/pin/reset', requireAuth, UserController.resetWhatsappPin);
router.patch('/me/whatsapp', requireAuth, UserController.setWhatsappOptIn);

// Is this email/phone already on BiZik? (used when inviting to a project)
// Turns a phone number or handle into a real name, so it is an identity
// oracle if left unthrottled.
router.get('/lookup', requireAuth, lookupLimiter, UserController.lookup);

export default router;
