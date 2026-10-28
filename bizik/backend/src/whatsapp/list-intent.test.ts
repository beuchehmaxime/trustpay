import { describe, expect, it } from 'vitest';

import { looksLikeCancelRequest, looksLikeDealListRequest } from './whatsapp-intent';

/**
 * Seeing what you already have is read-only and must work in every account
 * state - while verification is pending most of all, since that is exactly when
 * a user is told "not yet" about everything else. These are answered without
 * the model so nothing can swallow them.
 */
describe('looksLikeDealListRequest', () => {
  it('catches the phrasings that were being swallowed', () => {
    // Verbatim from the report.
    expect(looksLikeDealListRequest('List my deals both invited and the deals I have created')).toBe(true);
    expect(looksLikeDealListRequest('I want to view deals')).toBe(true);
    expect(looksLikeDealListRequest('my deals')).toBe(true);
    expect(looksLikeDealListRequest('show me my deals')).toBe(true);
    expect(looksLikeDealListRequest('what are my deals')).toBe(true);
    expect(looksLikeDealListRequest('list the deals I was invited to')).toBe(true);
  });

  it('works in French too', () => {
    expect(looksLikeDealListRequest('mes accords')).toBe(true);
    expect(looksLikeDealListRequest('voir mes accords')).toBe(true);
    expect(looksLikeDealListRequest('montre mes accords')).toBe(true);
  });

  it('leaves anything that is not a listing request to the assistant', () => {
    // Creating, funding and cancelling are actions, not lists.
    expect(looksLikeDealListRequest('create a deal')).toBe(false);
    expect(looksLikeDealListRequest('I want to fund the laptop deal')).toBe(false);
    expect(looksLikeDealListRequest('send 5000 to @maxime.ti')).toBe(false);
    expect(looksLikeDealListRequest('what is my balance')).toBe(false);
    expect(looksLikeDealListRequest('yes')).toBe(false);
  });

  it('does not fight the cancel classifier', () => {
    // A cancellation is handled by its own route; listing must not claim it.
    expect(looksLikeCancelRequest('cancel my deal')).toBe(true);
    expect(looksLikeDealListRequest('cancel my deal')).toBe(false);
    // …and a question ABOUT cancelled deals is a listing request, not a cancel.
    expect(looksLikeCancelRequest('list my deals that have not been cancelled')).toBe(false);
    expect(looksLikeDealListRequest('list my deals that have not been cancelled')).toBe(true);
  });
});
