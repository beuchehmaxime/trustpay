import { describe, expect, it } from 'vitest';

import { withinServiceWindow } from './whatsapp-notify';

/**
 * WhatsApp only delivers free-form messages within 24 hours of the person's own
 * last message. Meta may still return HTTP 200 outside that window and drop the
 * message silently, so this check - not the API response - decides whether a
 * proactive message can reach someone, and therefore whether we text instead.
 */
describe('withinServiceWindow', () => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);

  it('is open just after they messaged us', () => {
    expect(withinServiceWindow(minutesAgo(0))).toBe(true);
    expect(withinServiceWindow(minutesAgo(60))).toBe(true);
  });

  it('is open right up to the 24-hour edge', () => {
    expect(withinServiceWindow(minutesAgo(23 * 60 + 58))).toBe(true);
  });

  it('is closed once 24 hours have passed', () => {
    expect(withinServiceWindow(minutesAgo(24 * 60 + 1))).toBe(false);
    // The case that broke the Laptop reminder: last message ~30 hours earlier.
    expect(withinServiceWindow(minutesAgo(30 * 60))).toBe(false);
  });

  it('is closed for someone who has never messaged us', () => {
    expect(withinServiceWindow(null)).toBe(false);
  });
});
