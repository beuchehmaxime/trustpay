import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

import { redis } from '../lib/redis';
import { requireAuth } from '../middleware/auth.middleware';
import { sensitiveLimiter } from '../middleware/rate-limit';
import { AssistantController } from './assistant.controller';

const router = Router();

/**
 * Metered per signed-in user, not per IP.
 *
 * This is the one endpoint in the app where an abusive client costs money per
 * request rather than CPU, so the thing worth bounding is one person's model
 * spend. Keying on the IP would also punish a shared office or a carrier NAT,
 * where many legitimate users sit behind one address.
 *
 * It is applied AFTER requireAuth, which is the only reason `req.user` is there
 * to key on; mounted at the app level it would have run first and seen nobody.
 */
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.ASSISTANT_RATE_LIMIT_PER_MIN) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.sendCommand(args),
    prefix: 'rl:assistant:',
  }),
  // Flat `{ code, message }`, which is the shape the error handler emits and
  // the clients parse. Nesting it under `error` would make the client fall back
  // to its generic "we can not carry out this action" line, which tells the
  // user nothing about what to do.
  message: { code: 'Q-429', message: 'You are sending messages too quickly. Give it a moment.' },
});

// Every route needs a signed-in user. There is no guest mode here: the WhatsApp
// channel has one because a stranger can message a number, but nobody reaches
// this panel without an account already.
router.get('/status', requireAuth, AssistantController.status);
router.get('/history', requireAuth, AssistantController.history);
router.post('/chat', requireAuth, chatLimiter, AssistantController.chat);

// Voice costs a transcription call on top of the model turn, so it is metered
// on the same per-user budget. The body limit is its own: the global JSON limit
// is sized for ordinary API payloads and a base64 WAV is far larger than any of
// them.
router.post(
  '/voice',
  requireAuth,
  chatLimiter,
  express.json({ limit: '12mb' }),
  AssistantController.voice,
);

// The approval path. Rate limited like the other credential-checking endpoints,
// because a wrong PIN here is a guess at a money action and should cost the
// same as a wrong password does elsewhere.
router.post('/confirm', requireAuth, sensitiveLimiter, AssistantController.confirm);
router.post('/cancel', requireAuth, AssistantController.cancel);
router.post('/pin', requireAuth, sensitiveLimiter, AssistantController.setPin);

router.post('/reset', requireAuth, AssistantController.reset);

export default router;
