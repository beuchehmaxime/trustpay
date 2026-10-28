import { ContractStatus, Currency, MilestoneStatus } from '@prisma/client';

/** Display metadata + indicative USD rate per currency (for the mobile UI). */
export const CURRENCY_META: Record<Currency, { label: string; flag: string; usd: number }> = {
  USD: { label: 'US Dollar', flag: '🇺🇸', usd: 1 },
  EUR: { label: 'Euro', flag: '🇪🇺', usd: 1.09 },
  GBP: { label: 'Pound Sterling', flag: '🇬🇧', usd: 1.27 },
  NGN: { label: 'Nigerian Naira', flag: '🇳🇬', usd: 1 / 1512.4 },
  GHS: { label: 'Ghanaian Cedi', flag: '🇬🇭', usd: 1 / 13.8 },
  XAF: { label: 'CFA Franc', flag: '🌍', usd: 1 / 602.5 },
};

export function toUsd(amount: number, currency: Currency): number {
  return amount * CURRENCY_META[currency].usd;
}

/** Convert a USD amount into another currency's units. */
export function fromUsd(usdAmount: number, currency: Currency): number {
  return usdAmount / CURRENCY_META[currency].usd;
}

/**
 * The user's "home" display currency, derived from their country. Used so the
 * wallet headline shows a familiar number (e.g. FCFA for a Cameroon user)
 * instead of a tiny USD‑equivalent. Falls back to USD.
 */
const COUNTRY_CURRENCY: Record<string, Currency> = {
  Nigeria: 'NGN',
  Ghana: 'GHS',
  Cameroon: 'XAF',
  Chad: 'XAF',
  Gabon: 'XAF',
  'Central African Republic': 'XAF',
  'Equatorial Guinea': 'XAF',
  'United Kingdom': 'GBP',
  'United States': 'USD',
  // Eurozone client markets (CAD/AUD aren't supported yet → USD fallback).
  France: 'EUR',
  Germany: 'EUR',
  Netherlands: 'EUR',
  Ireland: 'EUR',
};
/**
 * ISO-3166 alpha-2 codes for the same markets. Early WhatsApp signups stored a
 * CODE where the rest of the platform stores a NAME, and an unmapped country
 * silently falls back to USD - which shows a Cameroonian user "USD 5,000" when
 * they meant FCFA. Accepting both spellings makes that impossible.
 */
const COUNTRY_BY_CODE: Record<string, string> = {
  CM: 'Cameroon',
  TD: 'Chad',
  GA: 'Gabon',
  CF: 'Central African Republic',
  GQ: 'Equatorial Guinea',
  NG: 'Nigeria',
  GH: 'Ghana',
  FR: 'France',
  GB: 'United Kingdom',
  US: 'United States',
  DE: 'Germany',
  NL: 'Netherlands',
  IE: 'Ireland',
};

/**
 * The ISO-2 code for a country NAME - the inverse of the map above.
 *
 * Needed because the clients store and send the name while a flag emoji, a dial
 * code and any locale formatting are all derived from the code. Built once from
 * the same table so the two directions cannot drift apart.
 */
const CODE_BY_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_BY_CODE).map(([code, name]) => [name, code]),
);

export function countryCodeFor(country?: string | null): string | null {
  const name = canonicalCountry(country);
  return name ? (CODE_BY_COUNTRY[name] ?? null) : null;
}

/**
 * The flag emoji for an ISO-2 code, built from the two regional-indicator
 * symbols rather than stored. A hardcoded flag table is one more thing to keep
 * in step with the country list, and this cannot fall out of step.
 */
export function flagFor(code?: string | null): string {
  if (!code || code.length !== 2) return '';
  const REGIONAL_INDICATOR_A = 0x1f1e6;
  const LETTER_A = 'A'.charCodeAt(0);
  return [...code.toUpperCase()]
    .map((letter) => String.fromCodePoint(REGIONAL_INDICATOR_A + letter.charCodeAt(0) - LETTER_A))
    .join('');
}

/** Resolve a country written either as a name or as an ISO-2 code. */
export function canonicalCountry(country?: string | null): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  if (!trimmed) return null;
  if (trimmed.length === 2) return COUNTRY_BY_CODE[trimmed.toUpperCase()] ?? trimmed;
  return trimmed;
}

export function homeCurrencyFor(country?: string | null): Currency {
  const resolved = canonicalCountry(country);
  if (!resolved) return 'USD';
  return COUNTRY_CURRENCY[resolved] ?? 'USD';
}

/**
 * Default app locale for a country. Francophone markets (CEMAC bloc + France)
 * default to French; everything else falls back to English. Kept in sync with
 * the mobile client's `languageForCountry` so signup and the server agree.
 */
const COUNTRY_LOCALE: Record<string, string> = {
  Cameroon: 'fr',
  Chad: 'fr',
  Gabon: 'fr',
  'Central African Republic': 'fr',
  'Equatorial Guinea': 'fr',
  France: 'fr',
};
export function localeForCountry(country?: string | null): string {
  const resolved = canonicalCountry(country);
  if (!resolved) return 'en';
  return COUNTRY_LOCALE[resolved] ?? 'en';
}

/** DB enum -> the human label the mobile client renders. */
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: 'Draft',
  INVITED: 'Draft',
  UNDER_REVIEW: 'Draft',
  SIGNED: 'Awaiting funding',
  FUNDED: 'In progress',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DISPUTED: 'Disputed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  PENDING: 'Pending',
  FUNDED: 'Funded',
  ACTIVE: 'In progress',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  RELEASED: 'Released',
  DISPUTED: 'Disputed',
  CANCELLED: 'Cancelled',
};

/** Deterministic accent colour for a contract card from its id. */
const ACCENTS = ['#3B82F6', '#06B6D4', '#16A34A', '#F59E0B', '#0EA5E9', '#6366F1'];
export function accentFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

/** Human date-group label used by the transactions list. */
export function dateGroup(d: Date, now: Date): string {
  const day = 24 * 60 * 60 * 1000;
  const startOf = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diff = (startOf(now) - startOf(d)) / day;
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
