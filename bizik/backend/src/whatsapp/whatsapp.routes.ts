import { Router } from 'express';

import { WhatsAppController } from './whatsapp.controller';

/**
 * WhatsApp Assistant webhook (Meta Cloud API). Public by design - Meta calls it.
 * The GET handshake is gated by the verify token; the POST is authenticated by
 * the X-Hub-Signature-256 HMAC (see WhatsAppController). No user auth here.
 */
const router = Router();

router.get('/webhook', WhatsAppController.verify);
router.post('/webhook', WhatsAppController.receive);

export default router;
