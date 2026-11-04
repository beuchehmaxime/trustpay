import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The consumer API must never hand a staff role to the dispute service.
 *
 * `DisputeService` takes a `role` and grants an admin bypass when it is
 * 'admin', 'compliance' or 'mediator': view any dispute, message on any
 * dispute, resolve any dispute. That exists for the ADMIN console, where
 * every route sits behind `requirePermission`.
 *
 * The consumer controller used to pass `req.user.role` through. Two things
 * were wrong with that. An operator signing into the user app could open a
 * case they had nothing to do with - which is how this was found. And the
 * bypass keys off the role string alone, so an operator holding only
 * `support.view` could have ruled on a dispute and moved the money, because
 * no permission is checked on that path at all.
 *
 * This reads the source rather than exercising the handlers. The thing worth
 * preventing is someone reintroducing `u.role` while refactoring, and a
 * behavioural test would need the whole request stack to catch it.
 */

const controller = readFileSync(
  join(__dirname, 'dispute.controller.ts'),
  'utf8',
);

describe('the consumer dispute API', () => {
  it('never passes the caller role to the service', () => {
    expect(controller).not.toMatch(/DisputeService\.\w+\([^)]*\bu\.role\b/);
    expect(controller).not.toMatch(/DisputeService\.\w+\([^)]*req\.user\.role/);
  });

  it('passes a plain party role instead', () => {
    // Every call that takes a role gets the same constant, so there is one
    // place to look and nothing to get inconsistent.
    const calls = controller.match(/DisputeService\.(byId|addMessage|addEvidence|resolve)\(/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(controller).toContain("const AS_A_PARTY = 'client'");
    for (const method of ['byId', 'addMessage', 'addEvidence', 'resolve']) {
      const call = new RegExp(`DisputeService\\.${method}\\([^;]*AS_A_PARTY`);
      expect(controller, `${method} should pass AS_A_PARTY`).toMatch(call);
    }
  });
});
