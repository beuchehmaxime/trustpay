import { describe, expect, it } from 'vitest';

import { countryCodeFor, flagFor } from '../lib/domain';
import { ContentService } from './content.service';

/**
 * The country list every client's picker is built from.
 *
 * It matters that this is exact rather than roughly right: the country is
 * stored and compared BY NAME, so a spelling the backend does not recognise is
 * a user who cannot finish verification, and a market an operator disabled must
 * not be offered only to be refused at submit.
 */
describe('public country list', () => {
  const countries = ContentService.countries();

  it('offers ONLY the markets that are open', () => {
    const names = countries.map((country) => country.name);
    // Cameroon is the only licensed market. The rest are listed in settings and
    // switched off, and a picker must never offer a country whose numbers
    // signup would then refuse.
    expect(names).toEqual(['Cameroon']);
  });

  it('carries the dial code the clients prefill from', () => {
    expect(countries[0].dialCode).toBe('+237');
  });

  it('gives every market a name and a currency, since both are stored', () => {
    for (const country of countries) {
      expect(country.name.length).toBeGreaterThan(1);
      expect(country.currency).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('carries the ISO code and a flag for the markets that have one mapped', () => {
    const cameroon = countries.find((country) => country.name === 'Cameroon');
    expect(cameroon?.code).toBe('CM');
    expect(cameroon?.flag).toBe('🇨🇲');
  });

  it('round-trips a name back to its code', () => {
    expect(countryCodeFor('Cameroon')).toBe('CM');
    // The canonical resolver accepts a code as well as a name.
    expect(countryCodeFor('CM')).toBe('CM');
    expect(countryCodeFor('Nowhere')).toBeNull();
  });

  it('derives flags rather than storing them, so they cannot drift', () => {
    expect(flagFor('NG')).toBe('🇳🇬');
    expect(flagFor('GB')).toBe('🇬🇧');
    // Anything that is not a two-letter code yields nothing rather than mojibake.
    expect(flagFor('')).toBe('');
    expect(flagFor(null)).toBe('');
    expect(flagFor('CMR')).toBe('');
  });
});
