import { describe, expect, it } from 'vitest';

import { containsPii, restore, scrub } from './pii-scrubber';

/**
 * What may leave this process, and what may not.
 *
 * These are the tests where a gap is not a bug but a disclosure, so they are
 * written from the attacker's end: not "does the happy path work" but "what
 * shape of phone number gets through".
 *
 * The second theme is as important and easier to forget: scrubbing must not
 * destroy the dispute. Amounts, quantities and dates are the evidence. A
 * scrubber that eats "250,000 FCFA" is safe and useless.
 */

describe('what must never leave', () => {
  it('takes a Cameroonian mobile number in every shape people write it', () => {
    const shapes = [
      '+237 677 12 34 56',
      '+237677123456',
      '237677123456',
      '677123456',
      '677 12 34 56',
      '677-12-34-56',
      '677.12.34.56',
      '6 77 12 34 56',
    ];
    for (const shape of shapes) {
      const { text } = scrub(`call me on ${shape} today`);
      expect(text, `leaked: ${shape}`).not.toMatch(/677/);
      expect(text).toMatch(/\[PHONE_\d+\]/);
    }
  });

  it('takes a fixed line too, not just mobile', () => {
    const { text } = scrub('the shop number is 233 42 11 22');
    expect(text).not.toMatch(/233 42/);
  });

  it('takes a +237 number even when the rest is malformed', () => {
    // A truncated or mistyped number is still a number.
    const { text } = scrub('he wrote +237 6771 2345');
    expect(text).not.toMatch(/6771/);
  });

  it('takes email addresses', () => {
    const { text } = scrub('mail me: paul.mbarga@example.cm please');
    expect(text).not.toMatch(/@example\.cm/);
    expect(text).toMatch(/\[EMAIL_1\]/);
  });

  it('takes a national ID when it is labelled', () => {
    const { text } = scrub('my CNI: 123456789 is attached');
    expect(text).not.toMatch(/123456789/);
    expect(text).toMatch(/\[ID_1\]/);
  });

  it('takes a mobile-money PIN, in English, French and Pidgin phrasing', () => {
    // Nobody should type this into a dispute. People do, and a leaked PIN is
    // money gone rather than privacy lost.
    for (const phrasing of [
      'my pin is 1234',
      'pin: 4821',
      'mon code secret 9087',
      'the secret code is 55213',
    ]) {
      const { text } = scrub(phrasing);
      expect(text, `leaked: ${phrasing}`).toMatch(/\[PIN_\d+\]/);
      expect(text).not.toMatch(/\b\d{4,6}\b/);
    }
  });

  it('refuses to call a payload clean when something identifying survived', () => {
    // The belt to the scrubber's braces: assert the outcome, do not trust the
    // process. Patterns are only as good as the day they were written.
    expect(containsPii('reach me on 677123456')).toBe(true);
    expect(containsPii('paul@example.cm')).toBe(true);
    expect(containsPii('[PHONE_1] said the item was broken')).toBe(false);
  });
});

describe('what must survive, because it is the evidence', () => {
  it('leaves money alone', () => {
    // A dispute is ABOUT the amount. Scrubbing it would quietly make every
    // recommendation worse while looking perfectly safe.
    const { text } = scrub('I paid 250000 FCFA for ten pieces');
    expect(text).toContain('250000');
    expect(text).toContain('ten pieces');
  });

  it('leaves large amounts written with separators alone', () => {
    for (const amount of ['1 000 000', '1,000,000', '45 000']) {
      const { text } = scrub(`the deal was ${amount} FCFA`);
      expect(text, `scrubbed an amount: ${amount}`).toContain(amount);
    }
  });

  it('leaves quantities and dates alone', () => {
    const { text } = scrub('on 12/09/2026 he sent 4 of the 10 items');
    expect(text).toContain('12/09/2026');
    expect(text).toContain('4');
    expect(text).toContain('10');
  });

  it('keeps the code-switching intact - that sentence IS the evidence', () => {
    const original = "The thing no be correct, j'ai payé pour dix";
    const { text } = scrub(original);
    expect(text).toBe(original);
  });
});

describe('names become stable tokens, so the argument still parses', () => {
  it('replaces each party with a consistent token', () => {
    const { text } = scrub('Paul promised ten but Marie received four', {
      partyNames: ['Paul', 'Marie'],
    });
    expect(text).toBe('PARTY_A promised ten but PARTY_B received four');
  });

  it('matches a full name before a first name, so nothing is half-replaced', () => {
    // "Paul Mbarga" must not become "PARTY_A Mbarga".
    const { text } = scrub('Paul Mbarga sent the parcel; Paul says it was fine', {
      partyNames: ['Paul Mbarga'],
    });
    expect(text).not.toMatch(/Mbarga/);
    expect(text).toBe('PARTY_A sent the parcel; PARTY_A says it was fine');
  });

  it('is case-insensitive, because chat is', () => {
    const { text } = scrub('PAUL said no, paul said yes', { partyNames: ['Paul'] });
    expect(text).toBe('PARTY_A said no, PARTY_A said yes');
  });

  it('gives one value one token however often it appears', () => {
    const { text, replacements } = scrub('677123456 ... again 677123456');
    expect(replacements.filter((entry) => entry.kind === 'phone')).toHaveLength(1);
    expect(text.match(/\[PHONE_1\]/g)).toHaveLength(2);
  });

  it('keeps tokens stable across several calls in one case', () => {
    // A case arrives in pieces - a transcript, then a chat log. The same
    // number must read as the same number across both or the model will think
    // it is looking at two people.
    const first = scrub('call 677123456');
    const second = scrub('still 677123456 and now 699887766', { carry: first.replacements });
    expect(second.text).toContain(first.replacements[0].token);
    expect(second.replacements.filter((entry) => entry.kind === 'phone')).toHaveLength(2);
  });
});

describe('restoring for the human who is allowed to see it', () => {
  it('puts the real values back for the mediator', () => {
    const original = 'Paul on 677123456 says the item was broken';
    const { text, replacements } = scrub(original, { partyNames: ['Paul'] });
    expect(restore(text, replacements)).toBe(original);
  });

  it('does not let a short token corrupt a longer one', () => {
    // [PHONE_1] must not rewrite part of [PHONE_11].
    const replacements = [
      { token: '[PHONE_1]', original: 'AAA', kind: 'phone' as const },
      { token: '[PHONE_11]', original: 'BBB', kind: 'phone' as const },
    ];
    expect(restore('[PHONE_11] and [PHONE_1]', replacements)).toBe('BBB and AAA');
  });
});

describe('the limits, stated rather than hidden', () => {
  it('does NOT catch a number spoken as words in a transcript', () => {
    // "six sept sept un deux trois quatre cinq six" survives, because digits
    // are not what is written. This is a real gap in the voice path and it is
    // pinned here so it is a known limitation rather than a surprise - the
    // transcript step must normalise spoken digits before this runs.
    const spoken = 'appelle-moi au six sept sept un deux trois quatre cinq six';
    const { text } = scrub(spoken);
    expect(text).toBe(spoken);
  });
});
