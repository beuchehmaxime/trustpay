/**
 * Strip personal data out of dispute evidence before it leaves this process.
 *
 * TrustPay sends transcripts and chat logs to a model API in another country.
 * The people in those messages are Cameroonian traders arguing about a phone
 * that arrived scratched; they did not consent to that, and nothing in the
 * reasoning needs their phone number to work. So the number does not go.
 *
 * Built before any model adapter, deliberately. The original plan had this
 * landing on day 7 with real voice notes flowing from day 2 - five days of
 * unredacted audio sent abroad before the guard existed. The order matters
 * more than the code.
 *
 * Two properties this is designed around:
 *
 * **Scrubbing must not destroy the argument.** A dispute is about who said
 * what and when. Replacing every name with [REDACTED] makes "Paul promised
 * ten, Marie received four" unreasonable-about. So names become stable tokens
 * - PARTY_A, PARTY_B - and the model reasons in those terms. {@link restore}
 * puts the real names back for the mediator, who is allowed to see them.
 *
 * **It fails closed.** Anything number-shaped that could be an identifier is
 * removed even at the cost of removing something harmless. An over-scrubbed
 * transcript is a worse recommendation; an under-scrubbed one is a disclosure.
 */

export type PiiKind = 'phone' | 'email' | 'id_number' | 'pin' | 'name';

export interface Replacement {
  /** The token that went into the outgoing text, e.g. `PARTY_A` or `[PHONE_1]`. */
  token: string;
  /** What it stands for. Never sent anywhere - used only to restore for a human. */
  original: string;
  kind: PiiKind;
}

export interface ScrubResult {
  /** Safe to send. */
  text: string;
  /** The map back, for rendering to a mediator who is entitled to see it. */
  replacements: Replacement[];
}

export interface ScrubOptions {
  /**
   * Real names of the two parties, so they become stable tokens rather than
   * being caught piecemeal by a name heuristic. Order is meaningful: the first
   * is PARTY_A.
   */
  partyNames?: string[];
  /** Reuse an existing map, so one case keeps one set of tokens across calls. */
  carry?: Replacement[];
}

/**
 * Cameroonian numbers, in the shapes people actually write them.
 *
 * Mobile is 9 digits beginning 6; fixed lines begin 2. Either may carry a
 * `+237` or `237` country prefix, and people separate the groups with spaces,
 * dots or dashes however they like.
 *
 * The 9-digit requirement is what stops this eating money. "250000" is six
 * digits and "1 000 000" is seven, so neither matches; `677 12 34 56` does.
 * Amounts are load-bearing evidence in a dispute - scrubbing them would be a
 * quiet way to make every recommendation worse.
 */
const PHONE = /(?:\+?237[\s.-]*)?[62](?:[\s.-]*\d){8}/g;

/**
 * Any `+237` number, even if the national part is malformed or truncated.
 *
 * Must END on a digit. Without the trailing `\d` the character class ran on
 * into the following space and swallowed it, so "+237 677 12 34 56 or mail"
 * came back as "[PHONE_1]or mail" - words glued together in the very text
 * being handed to a model to read.
 */
const PHONE_PREFIXED = /\+?237[\s.-]*\d[\d\s.-]{4,}\d/g;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Cameroonian national ID (CNI). Labelled forms only.
 *
 * A bare run of digits is far more likely to be a price, a quantity or a date
 * than an ID, so this requires the word - the cost of a miss here is lower
 * than the cost of shredding every number in the case file.
 */
const ID_NUMBER =
  /\b(?:CNI|NIU|ID|identit[ée]|carte\s+nationale|national\s+id|passport|passeport)\b[\s:#.-]*([A-Z0-9-]{5,20})/gi;

/**
 * A secret the model must never see, in any language anyone here uses.
 *
 * Nobody should be typing their mobile-money PIN into a dispute thread, which
 * is exactly why it has to be handled: people do, and a leaked PIN is money
 * gone rather than privacy lost. Covers English, French and the Pidgin
 * phrasing, and takes any 4-6 digit run that follows.
 */
const PIN =
  /\b(?:pin|code\s+secret|secret\s+code|mot\s+de\s+passe|password|motdepasse)\b[\s:is=]*(\d{4,6})\b/gi;

/**
 * Digits as people SAY them, in the three languages one voice note mixes.
 *
 * A transcript is not text someone typed - it is speech. "Call me on six
 * sept sept un deux trois quatre cinq six" is a phone number that every
 * pattern above sails straight past, because it contains no digits at all.
 * For a voice-first product in Cameroon that is the leak, not an edge case.
 *
 * Mixed deliberately into one table rather than one per language, because
 * the speech is mixed: "six sept seven un deux three" is a perfectly normal
 * way to read a number out here, and a per-language pass would break the run
 * in half and catch neither part.
 */
const SPOKEN_DIGITS: Record<string, string> = {
  // English, also the Pidgin numerals
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  // French
  zéro: '0', zero_fr: '0', un: '1', une: '1', deux: '2', trois: '3',
  quatre: '4', cinq: '5', sept: '7', huit: '8', neuf: '9',
};

/**
 * How many spoken digits in a row count as a number being read out.
 *
 * Seven, not six, and the gap matters. A Cameroonian mobile is nine digits
 * and people read them one at a time, so seven still catches a number the
 * transcription clipped. Amounts are the opposite: nobody says "two five
 * zero zero zero zero", they say "deux cent cinquante mille" - compound
 * words that are not in the table at all. Dropping to six would start
 * eating money read digit by digit, which is evidence.
 */
const SPOKEN_RUN_LENGTH = 7;

/**
 * Redact a number that was spoken rather than typed.
 *
 * Works on runs: a sequence of digit-words long enough to be somebody
 * reading out a number. Ordinary speech does not stack seven of these in a
 * row, so the false-positive cost is low and the miss cost is a published
 * phone number.
 */
function scrubSpokenDigits(text: string, mark: (original: string) => string): string {
  const words = text.split(/(\s+)/);
  const output = [...words];

  let runStart = -1;
  // The index of the LAST digit word, not of the word that broke the run.
  // Blanking up to the breaking word swallowed the separator before it, so
  // "...five six now" came back as "...five sixnow" - words fused together
  // in the exact text a model is asked to read. Same bug the written phone
  // pattern had; same shape, different place.
  let runEnd = -1;
  let runDigits = 0;

  const closeRun = () => {
    if (runDigits >= SPOKEN_RUN_LENGTH && runStart >= 0) {
      const spoken = words.slice(runStart, runEnd + 1).join('');
      // Keep whatever punctuation closed the run. "...cinq six. I don pay"
      // would otherwise come back as "[SPOKEN_1] I don pay", losing the
      // sentence boundary in text a model is about to reason over - and a
      // mediator is about to read.
      const trailing = spoken.match(/[^\p{L}\p{N}\s]+$/u)?.[0] ?? '';
      const token = mark(spoken.trim()) + trailing;
      for (let index = runStart; index <= runEnd; index += 1) output[index] = '';
      output[runStart] = token;
    }
    runStart = -1;
    runEnd = -1;
    runDigits = 0;
  };

  words.forEach((word, index) => {
    if (/^\s+$/.test(word)) return; // separators never break a run
    const normalised = word.toLowerCase().replace(/[^a-zà-ÿ]/gi, '');
    if (SPOKEN_DIGITS[normalised] !== undefined) {
      if (runStart < 0) runStart = index;
      runEnd = index;
      runDigits += 1;
      return;
    }
    closeRun();
  });
  closeRun();

  return output.join('');
}

/** Tokens are bracketed so a model cannot mistake one for ordinary prose. */
const token = (kind: string, index: number) => `[${kind.toUpperCase()}_${index}]`;

function escapeForRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove personal data from one piece of text.
 *
 * Order is deliberate: the most specific patterns run first, so a PIN labelled
 * "pin 1234" is caught as a PIN rather than left for a looser rule, and an
 * email is taken whole before its digits can be read as something else.
 */
export function scrub(text: string, options: ScrubOptions = {}): ScrubResult {
  const replacements: Replacement[] = [...(options.carry ?? [])];

  // One token per distinct value, so the same number appearing six times reads
  // as the same number to the model. Losing that would lose the argument.
  const seen = new Map<string, string>();
  for (const existing of replacements) seen.set(existing.original, existing.token);

  const counts = new Map<PiiKind, number>();
  // `label` is the word that appears in the token and is NOT the kind: an
  // id_number reads as [ID_1], which is shorter for the model to carry and
  // easier for a mediator to match up. Typed as string so they can diverge.
  function tokenFor(original: string, kind: PiiKind, label: string = kind): string {
    const already = seen.get(original);
    if (already) return already;
    const next = (counts.get(kind) ?? replacements.filter((r) => r.kind === kind).length) + 1;
    counts.set(kind, next);
    const assigned = token(label, next);
    seen.set(original, assigned);
    replacements.push({ token: assigned, original, kind });
    return assigned;
  }

  let output = text;

  // ---- Named parties first ------------------------------------------------
  // Before the generic rules, so "Paul" becomes PARTY_A everywhere rather than
  // being half-caught later. Longest first: "Paul Mbarga" must not be left as
  // "PARTY_A Mbarga" because "Paul" matched on its own.
  // Two orders, and they are not the same order. The LETTER comes from the
  // caller's order - the first party named is PARTY_A, always. The MATCHING
  // runs longest-first so "Paul Mbarga" is taken before "Paul" can claim half
  // of it. Deriving the letter from the sorted position made "Marie" PARTY_A
  // purely for being a longer word than "Paul", which silently swapped who
  // the model thought was the buyer.
  const names = (options.partyNames ?? [])
    .map((name, position) => ({ name, position }))
    .filter((entry) => entry.name && entry.name.trim().length > 1)
    .sort((left, right) => right.name.length - left.name.length);

  names.forEach(({ name: fullName, position }) => {
    const partyToken = `PARTY_${String.fromCharCode(65 + position)}`;
    const parts = [fullName, ...fullName.split(/\s+/).filter((part) => part.length > 2)].sort(
      (left, right) => right.length - left.length,
    );
    for (const part of parts) {
      const pattern = new RegExp(`\\b${escapeForRegex(part)}\\b`, 'gi');
      if (!pattern.test(output)) continue;
      pattern.lastIndex = 0;
      output = output.replace(pattern, partyToken);
    }
    if (!seen.has(fullName)) {
      seen.set(fullName, partyToken);
      replacements.push({ token: partyToken, original: fullName, kind: 'name' });
    }
  });

  // ---- Secrets ------------------------------------------------------------
  output = output.replace(PIN, (match, digits: string) =>
    match.replace(digits, tokenFor(digits, 'pin')),
  );

  output = output.replace(ID_NUMBER, (match, value: string) =>
    match.replace(value, tokenFor(value, 'id_number', 'id')),
  );

  // ---- Contact details ----------------------------------------------------
  output = output.replace(EMAIL, (match) => tokenFor(match, 'email'));
  output = output.replace(PHONE_PREFIXED, (match) => tokenFor(match.trim(), 'phone'));
  output = output.replace(PHONE, (match) => tokenFor(match.trim(), 'phone'));

  // Last, and on the already-redacted text: a number read aloud. Runs last
  // because the written forms are the cheaper match, and there is no point
  // scanning word-by-word over text a regex has already cleaned.
  output = scrubSpokenDigits(output, (spoken) => tokenFor(spoken, 'phone', 'spoken'));

  return { text: output, replacements };
}

/**
 * Put the real values back, for a mediator.
 *
 * The person approving the ruling is entitled to the full case file - the
 * scrubbing exists to keep data out of a third party's logs, not to hide it
 * from the human doing the deciding.
 */
export function restore(text: string, replacements: Replacement[]): string {
  let output = text;
  // Longest tokens first: [PHONE_11] must not be partly rewritten by [PHONE_1].
  const ordered = [...replacements].sort((left, right) => right.token.length - left.token.length);
  for (const entry of ordered) {
    output = output.split(entry.token).join(entry.original);
  }
  return output;
}

/**
 * Whether anything identifying survived - the check that runs before a payload
 * is actually sent.
 *
 * A scrubber is only as good as the day its patterns were written, so this
 * asserts the outcome rather than trusting the process. If it ever fires, the
 * request is refused instead of being sent and hoped about.
 */
export function containsPii(text: string): boolean {
  for (const pattern of [PHONE, PHONE_PREFIXED, EMAIL]) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}
