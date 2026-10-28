import { Router } from 'express';

import { config, missingConfig } from '../config/env';

/**
 * Liveness, and an honest answer about what is wired.
 *
 * `ready` is deliberately separate from `ok`: the process can be perfectly
 * alive while the pipeline cannot run because a model id is still blank. A
 * health check that says "ok" in that state is how a broken demo goes
 * unnoticed until it is on screen.
 */
const router = Router();

router.get('/health', (_req, res) => {
  const gaps = missingConfig();
  res.json({
    ok: true,
    service: 'trustpay',
    ready: gaps.length === 0,
    missing: gaps,
    models: {
      spark: config.meta.sparkModel,
      voice: config.meta.voiceModel || null,
      sam: config.meta.samModel || null,
      openWeights: config.openWeights.model,
    },
    escalation: config.escalation,
  });
});

export default router;
