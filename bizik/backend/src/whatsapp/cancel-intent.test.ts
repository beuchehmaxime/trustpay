import { describe, expect, it } from 'vitest';

import { looksLikeCancelRequest } from './whatsapp-intent';

/**
 * The chat handles a whole-deal cancellation itself instead of paying for an AI
 * turn - but only when the user is actually ASKING to cancel. Merely saying the
 * word (usually as a status: "not cancelled") must fall through to the
 * assistant, which is what these cases pin down.
 */
describe('looksLikeCancelRequest', () => {
  it('catches a real request to cancel', () => {
    expect(looksLikeCancelRequest('cancel deal')).toBe(true);
    expect(looksLikeCancelRequest('Please cancel the deal')).toBe(true);
    expect(looksLikeCancelRequest('I want you to cancel the above deal')).toBe(true);
    expect(looksLikeCancelRequest('cancel my invitation')).toBe(true);
    expect(looksLikeCancelRequest('QTQ-20260823-A8CB99 cancel this one')).toBe(true);
  });

  it('leaves LISTING requests alone, even when they mention cancellation', () => {
    // The two messages that were wrongly answered with "nothing to cancel".
    expect(looksLikeCancelRequest('Yes list all my deals that have not been cancelled')).toBe(false);
    expect(
      looksLikeCancelRequest('I want you to list all the deals that I am part of that are not cancelled'),
    ).toBe(false);
    expect(looksLikeCancelRequest('show me my cancelled deals')).toBe(false);
    expect(looksLikeCancelRequest('which of my deals were cancelled?')).toBe(false);
    expect(looksLikeCancelRequest('why was the Television deal cancelled')).toBe(false);
    expect(looksLikeCancelRequest('what is the status of the cancelled deal')).toBe(false);
  });

  it('understands the object by whatever word the user brings', () => {
    // BiZik's label is "deal", but users type what they know - and a
    // francophone user types the French noun.
    expect(looksLikeCancelRequest('cancel my invoice')).toBe(true);
    expect(looksLikeCancelRequest('cancel that order')).toBe(true);
    expect(looksLikeCancelRequest('cancel the contract')).toBe(true);
    expect(looksLikeCancelRequest('annuler cet accord')).toBe(true);
    expect(looksLikeCancelRequest('annuler la facture')).toBe(true);
    expect(looksLikeCancelRequest('annuler ma commande')).toBe(true);
  });

  it('reads French requests, and French STATUS words as status', () => {
    expect(looksLikeCancelRequest('annuler cet accord')).toBe(true);
    expect(looksLikeCancelRequest('annulez la facture')).toBe(true);
    // "annulé" is a state, and a listing request is not a cancellation.
    expect(looksLikeCancelRequest('mes accords annulés')).toBe(false);
    expect(looksLikeCancelRequest('liste mes accords non annulés')).toBe(false);
    expect(looksLikeCancelRequest('pourquoi cet accord a été annulé ?')).toBe(false);
  });

  it('ignores messages that have nothing to do with cancelling', () => {
    expect(looksLikeCancelRequest('what is my balance')).toBe(false);
    expect(looksLikeCancelRequest('remind the buyer to fund the laptop deal')).toBe(false);
    expect(looksLikeCancelRequest('')).toBe(false);
  });

  it('does not claim a bare "cancel" (aborting a flow) is a deal cancellation', () => {
    // Typing CANCEL mid-flow means "stop what we were doing" - handled earlier.
    expect(looksLikeCancelRequest('cancel')).toBe(false);
  });
});
