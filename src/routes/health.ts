import { Router } from 'express';

import { config, missingConfig } from '../config/env';
import { asyncHandler } from '../lib/errors';
import { smokeTest } from '../meta/client';

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

/**
 * Prove the key and the base URL actually work.
 *
 * Its own endpoint rather than part of /health, because it makes a real
 * outbound call and a liveness probe should never depend on a third party.
 * It catches the failure that otherwise wastes a day: a key that is present
 * but wrong, or a model id that does not exist - both of which look like
 * "nothing happens" from inside the pipeline.
 */
router.get(
  '/smoke',
  asyncHandler(async (_req, res) => {
    res.json(await smokeTest());
  }),
);

export default router;
