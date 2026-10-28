/**
 * Public handles ("maxime.bichenyi"). A handle is how one BiZik user names
 * another to send them money without knowing their phone number, so it has to
 * be readable, typable on a phone keypad, and unmistakable - no lookalike
 * characters, no leading digits, no impersonating BiZik itself.
 */

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

/** Handles nobody may hold: they would let someone impersonate the platform. */
const RESERVED = new Set([
  'bizik',
  'biziksupport',
  'support',
  'help',
  'helpdesk',
  'admin',
  'administrator',
  'root',
  'system',
  'escrow',
  'wallet',
  'payment',
  'payments',
  'official',
  'security',
  'billing',
  'noreply',
  'team',
  'staff',
  'moderator',
  'compliance',
  'bizikofficial',
  // The former brand, kept reserved so it cannot be squatted.
  'qatiqa',
  'qatiqasupport',
  'qatiqaofficial',
]);

/** Strip accents so "Béatrice" and "Beatrice" produce the same base handle. */
function deaccent(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Reduce any text to the handle alphabet: lowercase letters, digits and single
 * dots, starting with a letter. Returns '' when nothing usable is left.
 */
export function normalizeUsername(raw: string): string {
  const cleaned = deaccent(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.') // spaces, apostrophes, hyphens → separator
    .replace(/\.{2,}/g, '.')
    .replace(/^[^a-z]+/, '') // must start with a letter
    .replace(/\.+$/, '');
  return cleaned.slice(0, MAX_LENGTH).replace(/\.+$/, '');
}

export type UsernameProblem = 'too_short' | 'too_long' | 'invalid' | 'reserved';

/** Why this handle can't be used - or null when it's fine. */
export function validateUsername(candidate: string): UsernameProblem | null {
  const value = candidate.trim().toLowerCase();
  if (value.length < MIN_LENGTH) return 'too_short';
  if (value.length > MAX_LENGTH) return 'too_long';
  if (!/^[a-z][a-z0-9]*(\.[a-z0-9]+)*$/.test(value)) return 'invalid';
  const bare = value.replace(/\./g, '');
  if (RESERVED.has(bare)) return 'reserved';
  // Anything that merely STARTS like the platform ("bizik.s", "bizik2") would
  // still read as official to a person about to send money - refuse those too.
  if (bare.startsWith('bizik') || bare.startsWith('qatiqa')) return 'reserved';
  return null;
}

/** A human explanation for each problem, safe to show the user. */
export function usernameProblemMessage(problem: UsernameProblem): string {
  switch (problem) {
    case 'too_short':
      return `A handle needs at least ${MIN_LENGTH} characters.`;
    case 'too_long':
      return `A handle can be at most ${MAX_LENGTH} characters.`;
    case 'reserved':
      return 'That handle is reserved by BiZik. Please choose another.';
    case 'invalid':
      return 'A handle can use letters, numbers and dots, and must start with a letter.';
  }
}

/**
 * Candidate handles for a name, best first - "maxime.bichenyi", then
 * "maxime.b", then numbered variants. The caller takes the first free one.
 */
export function usernameCandidates(fullName: string, limit = 25): string[] {
  const parts = deaccent(fullName)
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);

  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1] : '';

  const bases: string[] = [];
  const add = (value: string) => {
    const normalized = normalizeUsername(value);
    if (normalized && validateUsername(normalized) === null && !bases.includes(normalized)) {
      bases.push(normalized);
    }
  };

  if (first && last) {
    add(`${first}.${last}`);
    add(`${first}.${last[0]}`);
    add(`${first}${last[0]}`);
  }
  add(first);
  // Someone called only "Ng" or whose name is entirely reserved/unusable still
  // needs a handle - fall back to a neutral, obviously-generated one.
  if (bases.length === 0) bases.push('qtq.user');

  const candidates: string[] = [...bases];
  for (let suffix = 2; candidates.length < limit; suffix += 1) {
    for (const base of bases) {
      if (candidates.length >= limit) break;
      const trimmed = base.slice(0, MAX_LENGTH - String(suffix).length);
      candidates.push(`${trimmed}${suffix}`);
    }
  }
  return candidates;
}
