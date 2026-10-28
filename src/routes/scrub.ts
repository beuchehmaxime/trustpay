import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler, AppError } from '../lib/errors';
import { containsPii, restore, scrub } from '../middleware/pii-scrubber';

/**
 * The scrubber, exposed so it can be exercised and demonstrated.
 *
 * It is worth being a route rather than only an internal step: the single
 * clearest way to show a judge that evidence is redacted before it leaves is
 * to let them paste a Cameroonian phone number in and watch it come back as a
 * token, with the amounts still intact beside it.
 */
const router = Router();

const scrubSchema = z.object({
  text: z.string().min(1).max(100_000),
  partyNames: z.array(z.string()).max(4).optional(),
});

router.post(
  '/scrub',
  asyncHandler(async (req, res) => {
    const input = scrubSchema.parse(req.body);
    const result = scrub(input.text, { partyNames: input.partyNames });

    // Assert the outcome rather than trusting the patterns. If anything
    // identifying survived, this is a bug in the scrubber and the right
    // response is to refuse, not to hand back a payload that looks clean.
    if (containsPii(result.text)) {
      throw new AppError(
        500,
        'Q-500-PII',
        'Redaction did not fully succeed, so nothing is returned.',
      );
    }

    res.json({
      scrubbed: result.text,
      // Counts only. The map back stays in this process - returning the
      // originals would undo the entire point of the endpoint.
      redacted: result.replacements.reduce<Record<string, number>>((tally, entry) => {
        tally[entry.kind] = (tally[entry.kind] ?? 0) + 1;
        return tally;
      }, {}),
    });
  }),
);

export { restore };
export default router;
