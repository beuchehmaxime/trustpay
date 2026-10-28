/**
 * Phone-number normalisation for the phone-first identity model. A phone number
 * is the account's login key, so the SAME number must always resolve to the
 * SAME stored string - regardless of how the user typed spaces, dashes or
 * brackets. We normalise to a compact E.164-ish form: a leading '+' followed by
 * digits only.
 */

/** Strip formatting and coerce to `+<digits>`. Does not validate length. */
export function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[\s\-().]/g, '');
  if (stripped.startsWith('+')) return `+${stripped.slice(1).replace(/\D/g, '')}`;
  return `+${stripped.replace(/\D/g, '')}`;
}

/**
 * Dialling codes for the markets BiZik operates in. People type their Mobile
 * Money number the local way ("677123456"), which is not dialable on its own -
 * these turn it into a real MSISDN using the account's country.
 */
const DIALLING_CODES: Record<string, string> = {
  Cameroon: '237',
  Chad: '235',
  Gabon: '241',
  'Central African Republic': '236',
  'Equatorial Guinea': '240',
  Nigeria: '234',
  Ghana: '233',
  France: '33',
  'United Kingdom': '44',
  'United States': '1',
};

/**
 * Turn what someone typed into a dialable MSISDN. An international number is
 * kept as-is; a local one ("677123456", "0677123456") gains the dialling code of
 * `country` - falling back to Cameroon, the primary Mobile Money market.
 */
export function toMsisdn(raw: string, country?: string | null): string {
  const digitsOnly = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+') || digitsOnly.length > 11) return normalizePhone(raw);

  const code = DIALLING_CODES[(country ?? '').trim()] ?? DIALLING_CODES.Cameroon;
  // A leading 0 is the national trunk prefix - it is dropped before the code.
  const national = digitsOnly.replace(/^0+/, '');
  if (national.startsWith(code)) return `+${national}`;
  return `+${code}${national}`;
}

/**
 * The comparable tail of a number: the last 9 digits, which is the subscriber
 * part in the markets BiZik serves. Comparing tails lets "677123456" and
 * "+237677123456" match without a full parsing library - while keeping numbers
 * that merely LOOK similar (a digit changed) firmly apart.
 */
export function numberTail(raw: string): string {
  return raw.replace(/\D/g, '').slice(-9);
}

/** Do these two spellings refer to the same subscriber number? */
export function isSameNumber(a: string, b: string): boolean {
  const left = numberTail(a);
  const right = numberTail(b);
  // Too short to be a real mobile number - never treat as a match.
  if (left.length < 8 || right.length < 8) return false;
  return left === right;
}

/** Does this text contain the given number (however the sender spelled it)? */
export function textContainsNumber(text: string, raw: string): boolean {
  const tail = numberTail(raw);
  if (tail.length < 8) return false;
  return text.replace(/\D/g, '').includes(tail);
}

/** A normalised phone is valid when it's a '+' and 7-15 digits (E.164 range). */
export function isValidPhone(raw: string): boolean {
  return /^\+\d{7,15}$/.test(normalizePhone(raw));
}
