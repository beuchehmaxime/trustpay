import { describe, expect, it } from 'vitest';

import { describeReceipt } from './sms.routes';

/**
 * The Orange delivery-receipt webhook is PUBLIC - Orange neither signs its
 * receipts nor offers a shared token - so every field in the payload is
 * attacker-controlled. What makes that acceptable is that the endpoint never
 * acts on what it is told and its one log line cannot be used to forge others.
 * These pin both, plus what each documented status actually means.
 */
const NUMBER = 'tel:+237650035675';

function receipt(deliveryInfo: Record<string, unknown>, callbackData?: unknown) {
  return { deliveryInfoNotification: { callbackData, deliveryInfo } };
}

const outcomeFor = (deliveryStatus: unknown) =>
  describeReceipt(receipt({ address: NUMBER, deliveryStatus })).outcome;

describe('Orange delivery receipts', () => {
  it('maps each documented status to what it actually means', () => {
    // The only status that proves the handset received it.
    expect(outcomeFor('DeliveredToTerminal')).toBe('delivered');
    // Expired without arriving - though Orange says it may still land later.
    expect(outcomeFor('DeliveryImpossible')).toBe('failed');
    // Handed to ANOTHER operator, so Orange cannot say. Routine when messaging
    // MTN numbers and NOT a failure: reading it as one would have us chasing a
    // fault every time we sent off-net.
    expect(outcomeFor('DeliveryUncertain')).toBe('unknown');
    // Still on its way.
    expect(outcomeFor('DeliveredToNetwork')).toBe('pending');
    expect(outcomeFor('MessageWaiting')).toBe('pending');
    // Anything Orange adds later is unknown, never a failure.
    expect(outcomeFor('SomethingOrangeAddsLater')).toBe('unknown');
  });

  it('survives junk without throwing, because Orange never retries', () => {
    for (const payload of [undefined, null, {}, { deliveryInfoNotification: {} }, { junk: 1 }, []]) {
      expect(() => describeReceipt(payload)).not.toThrow();
    }
  });

  it('masks the number instead of printing it in full', () => {
    const { line } = describeReceipt(
      receipt({ address: NUMBER, deliveryStatus: 'DeliveredToTerminal' }),
    );
    expect(line).not.toContain('650035675');
    expect(line).toContain('5675');
  });

  it('cannot be used to forge extra log lines', () => {
    const { line } = describeReceipt(
      receipt(
        { address: NUMBER, deliveryStatus: 'Delivered\r\n[payments] payout approved' },
        'x\n[auth] admin login succeeded',
      ),
    );
    expect(line).not.toContain('\n');
    expect(line).not.toContain('\r');
    // The text still shows, flattened onto the one line it is allowed.
    expect(line).toContain('admin login succeeded');
  });

  it('truncates long fields so one report cannot fill the log', () => {
    const { line } = describeReceipt(
      receipt({ address: NUMBER, deliveryStatus: 'B'.repeat(5000) }, 'A'.repeat(5000)),
    );
    expect(line.length).toBeLessThan(200);
  });

  it('reads the RAW status, never the sanitised one', () => {
    // Padded so that sanitising would trim it back to a known status. The
    // decision must not follow the string that was cleaned up for display.
    expect(outcomeFor('\nDeliveryImpossible\n')).toBe('unknown');
  });

  it('ignores a non-string field rather than coercing it', () => {
    const { line, outcome } = describeReceipt(
      receipt({ address: { toString: () => 'tel:+237000000000' }, deliveryStatus: 42 }, null),
    );
    expect(outcome).toBe('unknown');
    expect(line).not.toContain('237000000000');
  });

  it('carries the resource id through, which is what ties a receipt to a send', () => {
    const { line } = describeReceipt(
      receipt(
        { address: NUMBER, deliveryStatus: 'DeliveredToTerminal' },
        '27984aa9-1a80-421c-8381-4a90f19ccb17',
      ),
    );
    expect(line).toContain('27984aa9-1a80-421c-8381-4a90f19ccb17');
  });
});
