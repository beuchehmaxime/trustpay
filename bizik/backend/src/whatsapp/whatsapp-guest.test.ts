import { describe, expect, it } from 'vitest';

import {
  cleanPersonName,
  describeSignupState,
  guestCopy,
  isExplicitAgreement,
  looksLikePersonName,
  parseGuestDecision,
} from './whatsapp-guest';

describe('looksLikePersonName', () => {
  it('rejects the exact messages that became account names in production', () => {
    // "Thanks How!" and "Thanks Je!" came from these.
    expect(looksLikePersonName('How do I create an account')).toBe(false);
    expect(looksLikePersonName('Je parle en francaise pourqoui tu ne reponds pas en francaise?')).toBe(false);
  });

  it('rejects greetings, questions and requests', () => {
    expect(looksLikePersonName('Bonjour')).toBe(false);
    expect(looksLikePersonName('Hello')).toBe(false);
    expect(looksLikePersonName('what is bizik?')).toBe(false);
    expect(looksLikePersonName('I want to send money')).toBe(false);
    expect(looksLikePersonName('Stop')).toBe(false);
    expect(looksLikePersonName('Comment ça marche')).toBe(false);
  });

  it('rejects anything with digits or symbols', () => {
    expect(looksLikePersonName('+237 6 70 00 00 00')).toBe(false);
    expect(looksLikePersonName('send 5000 to @amina')).toBe(false);
    expect(looksLikePersonName('x')).toBe(false);
  });

  it('accepts real names, accents and hyphens included', () => {
    expect(looksLikePersonName('Jean Mbarga')).toBe(true);
    expect(looksLikePersonName('Amina Okafor')).toBe(true);
    expect(looksLikePersonName('Béatrice Ngo-Nlend')).toBe(true);
    expect(looksLikePersonName("N'Diaye Fatou")).toBe(true);
    expect(looksLikePersonName('Maxime Bichenyi')).toBe(true);
  });
});

describe('cleanPersonName', () => {
  it('collapses spacing and trims stray punctuation', () => {
    expect(cleanPersonName('  Jean   Mbarga. ')).toBe('Jean Mbarga');
  });
});

describe('isExplicitAgreement', () => {
  it('accepts the button and explicit wording in both languages', () => {
    expect(isExplicitAgreement('onboard_agree')).toBe(true);
    expect(isExplicitAgreement('I agree')).toBe(true);
    expect(isExplicitAgreement('I accept')).toBe(true);
    expect(isExplicitAgreement("J'accepte")).toBe(true);
  });

  it('never records a refusal as consent', () => {
    expect(isExplicitAgreement("I don't agree")).toBe(false);
    expect(isExplicitAgreement('I do not accept')).toBe(false);
    expect(isExplicitAgreement('I disagree')).toBe(false);
    expect(isExplicitAgreement("Je n'accepte pas")).toBe(false);
  });

  it('does not treat a bare yes as legal consent', () => {
    expect(isExplicitAgreement('yes')).toBe(false);
    expect(isExplicitAgreement('ok')).toBe(false);
    expect(isExplicitAgreement('oui')).toBe(false);
  });
});

describe('parseGuestDecision', () => {
  it('reads a well-formed decision', () => {
    const decision = parseGuestDecision(
      JSON.stringify({ language: 'fr', intent: 'chat', full_name: '', country: '', reply: 'Bonjour !' }),
    );
    expect(decision).toEqual({ language: 'fr', intent: 'chat', fullName: '', country: '', reply: 'Bonjour !' });
  });

  it('refuses anything malformed, so the service never acts on a guess', () => {
    expect(parseGuestDecision('not json')).toBeNull();
    expect(parseGuestDecision(JSON.stringify({ language: 'de', intent: 'chat', reply: 'x' }))).toBeNull();
    expect(parseGuestDecision(JSON.stringify({ language: 'en', intent: 'create_account', reply: 'x' }))).toBeNull();
  });
});

describe('describeSignupState', () => {
  it('tells the model what signup is waiting for', () => {
    expect(describeSignupState({ step: 'none' })).toMatch(/not asked for an account/i);
    expect(describeSignupState({ step: 'name' })).toMatch(/FULL NAME/);
    expect(describeSignupState({ step: 'country', fullName: 'Jean Mbarga' })).toMatch(/COUNTRY/);
  });

  it('asks for an introduction on first contact', () => {
    expect(describeSignupState({ step: 'none', firstContact: true })).toMatch(/FIRST CONTACT/);
  });
});

describe('guestCopy', () => {
  it('speaks French to French speakers', () => {
    expect(guestCopy('fr').askCountry('Jean')).toBe(
      'Merci Jean ! Dans quel pays êtes-vous ? Cela définit votre devise et votre langue.',
    );
    expect(guestCopy('fr').agreeButton).toBe("J'accepte");
  });

  it('keeps WhatsApp button titles within the 20-character limit', () => {
    for (const locale of ['en', 'fr'] as const) {
      const copy = guestCopy(locale);
      for (const title of [copy.agreeButton, copy.declineButton, copy.countryButton]) {
        expect(title.length).toBeLessThanOrEqual(20);
      }
    }
  });

  it('contains no em or en dashes', () => {
    for (const locale of ['en', 'fr'] as const) {
      const copy = guestCopy(locale);
      const text = JSON.stringify(copy) + copy.consent('Cameroon', 't', 'p') + copy.askCountry('Jean');
      expect(text).not.toMatch(/[–—]/);
    }
  });
});
