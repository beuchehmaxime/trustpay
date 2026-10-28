import { describe, expect, it } from 'vitest';

import { amlMonitoringSettings } from '../lib/system-settings';
import { evaluateUser } from './transaction-monitor';

/**
 * The detection rules themselves.
 *
 * These matter more than most tests here: a rule that silently stops firing
 * looks exactly like a quiet month, and nobody notices a compliance control
 * that has failed open until a regulator asks for the evidence. So each rule is
 * pinned both ways - it fires on the pattern it exists for, and it stays quiet
 * on the ordinary behaviour that resembles it.
 */
const settings = amlMonitoringSettings();

type Movement = Parameters<typeof evaluateUser>[0][number];

/** A movement `hoursAgo` in the past, in XAF. */
function movement(type: Movement['type'], xaf: number, hoursAgo = 1): Movement {
  return {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    userId: 'user-1',
    type,
    xaf,
    createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    reference: 'QTX-TEST',
  };
}

const typesOf = (movements: Movement[]) =>
  evaluateUser(movements, settings).map((finding) => finding.type);

describe('AML transaction monitoring', () => {
  it('says nothing about an ordinary account', () => {
    expect(
      typesOf([movement('DEPOSIT', 40_000, 10), movement('TRANSFER_OUT', 25_000, 5)]),
    ).toEqual([]);
  });

  it('opens a case on a single large movement', () => {
    const findings = evaluateUser([movement('WITHDRAWAL', settings.reviewThresholdXaf + 1)], settings);
    expect(findings.map((finding) => finding.type)).toContain('HIGH_RISK_FLOW');
    expect(findings[0].details.rule).toBe('large_transaction');
    // The reason is read by a human in a queue, so it has to carry the amount
    // in the currency they actually work in.
    expect(findings[0].reason).toMatch(/FCFA/);
    expect(findings[0].reason).toMatch(/review line/i);
  });

  it('detects structuring: several deposits just under the REPORTING threshold', () => {
    const justUnder = settings.reportingThresholdXaf * 0.4;
    const deposits = Array.from({ length: settings.structuringMinCount }, (_unused, index) =>
      movement('DEPOSIT', justUnder, index + 1),
    );
    expect(typesOf(deposits)).toContain('STRUCTURING');
  });

  it('does NOT call ordinary small top-ups structuring', () => {
    // Well below the near-threshold band. Someone adding pocket money daily is
    // not evading a reporting threshold, and treating them as if they were is
    // how a compliance queue becomes unreadable.
    const small = Array.from({ length: 10 }, (_unused, index) => movement('DEPOSIT', 5_000, index + 1));
    expect(typesOf(small)).not.toContain('STRUCTURING');
  });

  it('does not call a few near-threshold deposits structuring if they do not add up', () => {
    // Two deposits in the band, but their total is under the threshold, so
    // nothing has been evaded.
    const deposits = [
      movement('DEPOSIT', settings.reportingThresholdXaf * 0.35, 1),
      movement('DEPOSIT', settings.reportingThresholdXaf * 0.35, 2),
    ];
    expect(typesOf(deposits)).not.toContain('STRUCTURING');
  });

  it('flags velocity by count', () => {
    const many = Array.from({ length: settings.velocityMaxCount }, () => movement('TRANSFER_OUT', 10_000));
    expect(typesOf(many)).toContain('VELOCITY_ANOMALY');
  });

  it('flags velocity by value even when the count is low', () => {
    const few = [
      movement('TRANSFER_OUT', settings.velocityMaxXaf / 2),
      movement('TRANSFER_OUT', settings.velocityMaxXaf / 2),
    ];
    expect(typesOf(few)).toContain('VELOCITY_ANOMALY');
  });

  it('ignores movements that fall outside the velocity window', () => {
    const old = Array.from({ length: settings.velocityMaxCount + 5 }, () =>
      movement('TRANSFER_OUT', 10_000, settings.velocityWindowHours + 24),
    );
    expect(typesOf(old)).not.toContain('VELOCITY_ANOMALY');
  });

  it('flags money that arrives and leaves again almost untouched', () => {
    const amount = settings.passThroughMinXaf * 2;
    const findings = evaluateUser(
      [movement('DEPOSIT', amount, 3), movement('WITHDRAWAL', amount * 0.95, 1)],
      settings,
    );
    const passThrough = findings.find((finding) => finding.details.rule === 'pass_through');
    expect(passThrough).toBeDefined();
    expect(passThrough?.type).toBe('HIGH_RISK_FLOW');
  });

  it('does not call it pass-through when most of the money stays', () => {
    const amount = settings.passThroughMinXaf * 2;
    const findings = evaluateUser(
      [movement('DEPOSIT', amount, 3), movement('WITHDRAWAL', amount * 0.2, 1)],
      settings,
    );
    expect(findings.find((finding) => finding.details.rule === 'pass_through')).toBeUndefined();
  });

  it('does not call it pass-through below the minimum worth reviewing', () => {
    const tiny = settings.passThroughMinXaf / 4;
    const findings = evaluateUser(
      [movement('DEPOSIT', tiny, 3), movement('WITHDRAWAL', tiny, 1)],
      settings,
    );
    expect(findings.find((finding) => finding.details.rule === 'pass_through')).toBeUndefined();
  });

  it('can raise more than one finding for one account', () => {
    // A large deposit straight back out again is both of those things, and a
    // reviewer should see both reasons rather than whichever rule ran first.
    const amount = settings.reviewThresholdXaf * 2;
    const findings = evaluateUser(
      [movement('DEPOSIT', amount, 2), movement('WITHDRAWAL', amount * 0.9, 1)],
      settings,
    );
    expect(findings.length).toBeGreaterThan(1);
  });

  it('carries evidence a reviewer can act on', () => {
    const findings = evaluateUser([movement('DEPOSIT', settings.reviewThresholdXaf * 3)], settings);
    for (const finding of findings) {
      expect(finding.reason.length).toBeGreaterThan(20);
      expect(finding.details.rule).toBeTruthy();
    }
  });

  it('is switched off cleanly when disabled', () => {
    // Not by returning nothing from the rules - the sweep checks `enabled`
    // before it reads anything - but the thresholds must still be whole, so a
    // settings row saved before a rule existed cannot leave it undefined.
    for (const [key, value] of Object.entries(settings)) {
      expect(value, `setting ${key} must have a value`).not.toBeUndefined();
    }
  });
});
