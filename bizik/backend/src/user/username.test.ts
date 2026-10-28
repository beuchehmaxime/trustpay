import { describe, expect, it } from 'vitest';

import {
  normalizeUsername,
  usernameCandidates,
  validateUsername,
} from './username';

/**
 * A handle is how one user names another to send them money, so the rules that
 * matter are: it comes out of a real name predictably, it can't impersonate
 * BiZik, and two people with the same name get different handles.
 */
describe('usernameCandidates', () => {
  it('derives a readable handle from a full name', () => {
    expect(usernameCandidates('Maxime Bichenyi')[0]).toBe('maxime.bichenyi');
  });

  it('strips accents so the handle stays typable on any keyboard', () => {
    expect(usernameCandidates('Béatrice Ndém')[0]).toBe('beatrice.ndem');
    expect(usernameCandidates("N'Guessan Koffi")[0]).toBe('nguessan.koffi');
  });

  it('offers shorter forms, then numbered ones, so a clash always resolves', () => {
    const candidates = usernameCandidates('Maxime Bichenyi', 8);
    expect(candidates).toContain('maxime.b');
    expect(candidates).toContain('maxime');
    // Everything after the base forms is numbered, and all are distinct.
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates.some((value) => /\d$/.test(value))).toBe(true);
  });

  it('handles a single-word name', () => {
    expect(usernameCandidates('Madiba')[0]).toBe('madiba');
  });

  it('still produces something for a name with nothing usable in it', () => {
    // Every candidate must be a valid handle, whatever the input looked like.
    for (const name of ['???', '123', '  ', 'Support']) {
      const [first] = usernameCandidates(name);
      expect(first).toBeTruthy();
      expect(validateUsername(first)).toBeNull();
    }
  });

  it('never proposes a reserved handle', () => {
    // "BiZik Support" must not yield something that looks official.
    for (const candidate of usernameCandidates('BiZik Support', 10)) {
      expect(validateUsername(candidate)).toBeNull();
    }
  });

  it('keeps every candidate within the length limit', () => {
    for (const candidate of usernameCandidates('Bartholomew Maximilian Fitzgerald', 12)) {
      expect(candidate.length).toBeLessThanOrEqual(20);
    }
  });
});

describe('validateUsername', () => {
  it('accepts handles people would actually choose', () => {
    for (const value of ['maxime', 'maxime.b', 'maxime.bichenyi', 'ama2', 'jean.paul.k']) {
      expect(validateUsername(value)).toBeNull();
    }
  });

  it('rejects impersonation of the platform', () => {
    expect(validateUsername('bizik')).toBe('reserved');
    expect(validateUsername('support')).toBe('reserved');
    // Dots must not be a way around the reserved list.
    expect(validateUsername('q.a.t.i.q.a')).toBe('reserved');
    // Anything merely STARTING like the platform reads as official too.
    expect(validateUsername('bizik.support')).toBe('reserved');
    expect(validateUsername('bizik2')).toBe('reserved');
    expect(validateUsername('bizik.s')).toBe('reserved');
  });

  it('rejects shapes that would be ambiguous or unusable', () => {
    expect(validateUsername('ab')).toBe('too_short');
    expect(validateUsername('a'.repeat(21))).toBe('too_long');
    expect(validateUsername('2pac')).toBe('invalid'); // must start with a letter
    expect(validateUsername('max..b')).toBe('invalid'); // no double dots
    expect(validateUsername('max b')).toBe('invalid'); // no spaces
    expect(validateUsername('max@b')).toBe('invalid');
    expect(validateUsername('max.')).toBe('invalid'); // no trailing dot
  });
});

describe('normalizeUsername', () => {
  it('turns what a user types into the handle alphabet', () => {
    expect(normalizeUsername('Maxime B')).toBe('maxime.b');
    expect(normalizeUsername('  MAXIME.BICHENYI  ')).toBe('maxime.bichenyi');
    expect(normalizeUsername('maxime--b')).toBe('maxime.b');
  });
});
