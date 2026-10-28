import { describe, expect, it } from 'vitest';

import { firstNameOf, personalise, usesName } from './personalise';

/**
 * Writing a stranger's name into a message that goes to hundreds of people.
 *
 * The failure modes are small and embarrassing rather than dramatic: a greeting
 * that reads "Hi , this is Bizik", or one that greets somebody by a blank. On a
 * channel where looking automated is what gets a number reported, those are the
 * cost, so they are what these pin.
 */
describe('firstNameOf', () => {
  it('takes the first word of a name', () => {
    expect(firstNameOf('Daniel Ngue')).toBe('Daniel');
    expect(firstNameOf('Nguepy Laurette Francine')).toBe('Nguepy');
  });

  it('handles a single-word name, which IS the first name', () => {
    expect(firstNameOf('Chesca')).toBe('Chesca');
  });

  it('copes with the spacing real data actually has', () => {
    expect(firstNameOf('  Daniel   Ngue  ')).toBe('Daniel');
    expect(firstNameOf('Théodore romeo Foe Foe')).toBe('Théodore');
  });

  it('keeps accents and non-ASCII letters intact', () => {
    // "NGUIDJÔ Marieleine" is a real row in the segment this will be sent to.
    expect(firstNameOf('NGUIDJÔ Marieleine')).toBe('NGUIDJÔ');
  });

  it('returns nothing for a name that is not one', () => {
    // Better to greet nobody than to open a message with "Hi -,".
    expect(firstNameOf(null)).toBe('');
    expect(firstNameOf(undefined)).toBe('');
    expect(firstNameOf('')).toBe('');
    expect(firstNameOf('   ')).toBe('');
    expect(firstNameOf('-')).toBe('');
    expect(firstNameOf('...')).toBe('');
  });
});

describe('personalise', () => {
  const EN = 'Hi {name}, this is Bizik - you created an account with us.';
  const FR = "Bonjour {name}, c'est Bizik - vous avez cree un compte chez nous.";

  it('puts the first name in', () => {
    expect(personalise(EN, 'Daniel Ngue')).toBe(
      'Hi Daniel, this is Bizik - you created an account with us.',
    );
  });

  it('works the same in French', () => {
    expect(personalise(FR, 'Nafisatou Hamidou')).toBe(
      "Bonjour Nafisatou, c'est Bizik - vous avez cree un compte chez nous.",
    );
  });

  it('reads correctly when there is no name, rather than leaving a gap', () => {
    // The whole point: "Hi , this is Bizik" is the tell that a machine wrote it.
    expect(personalise(EN, null)).toBe('Hi, this is Bizik - you created an account with us.');
    expect(personalise(FR, '')).toBe("Bonjour, c'est Bizik - vous avez cree un compte chez nous.");
  });

  it('never leaves a stray space before punctuation', () => {
    for (const mark of [',', '.', '!', '?', ':', ';']) {
      expect(personalise(`Hello {name}${mark} welcome`, null)).toBe(`Hello${mark} welcome`);
    }
  });

  it('does not leave a double space mid-sentence', () => {
    expect(personalise('Hello {name} and welcome', null)).toBe('Hello and welcome');
  });

  it('replaces every occurrence, not just the first', () => {
    expect(personalise('Hi {name}. Thanks {name}.', 'Chesca Mbah')).toBe(
      'Hi Chesca. Thanks Chesca.',
    );
  });

  it('accepts the casing an operator is likely to type', () => {
    expect(personalise('Hi {Name}', 'Daniel Ngue')).toBe('Hi Daniel');
    expect(personalise('Hi {NAME}', 'Daniel Ngue')).toBe('Hi Daniel');
  });

  it('leaves a body with no token completely alone', () => {
    const plain = 'This is Bizik. Your account is not verified yet.';
    expect(personalise(plain, 'Daniel Ngue')).toBe(plain);
    expect(personalise(plain, null)).toBe(plain);
  });

  it('does NOT touch Meta template placeholders', () => {
    // {{1}} belongs to Meta and is the same for everyone. Filling it here would
    // send one stranger's name to the whole audience.
    expect(personalise('Hi {{1}}, from Bizik', 'Daniel Ngue')).toBe('Hi {{1}}, from Bizik');
  });

  it('keeps line breaks, which a multi-paragraph message depends on', () => {
    const multi = 'Hi {name},\n\nYour account is not verified.\n\nBizik';
    expect(personalise(multi, 'Daniel Ngue')).toBe(
      'Hi Daniel,\n\nYour account is not verified.\n\nBizik',
    );
    expect(personalise(multi, null)).toBe('Hi,\n\nYour account is not verified.\n\nBizik');
  });
});

describe('usesName', () => {
  it('spots the token so a campaign without one never queries for names', () => {
    expect(usesName('Hi {name}')).toBe(true);
    expect(usesName('Hi {NAME}')).toBe(true);
    expect(usesName('Hi there')).toBe(false);
    expect(usesName(null)).toBe(false);
  });

  it('is not confused by being called twice, despite the global regex', () => {
    // A /g regex keeps lastIndex between calls; forgetting to reset it makes
    // every other call return false, which would silently drop the name from
    // half the batches.
    const body = 'Hi {name}';
    expect(usesName(body)).toBe(true);
    expect(usesName(body)).toBe(true);
    expect(usesName(body)).toBe(true);
  });
});
