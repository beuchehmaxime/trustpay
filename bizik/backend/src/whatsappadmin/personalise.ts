/**
 * Putting a person's name into a campaign message.
 *
 * `{name}` in the body is replaced with the recipient's first name. It is the
 * one personalisation worth having here: an unexpected message from an unknown
 * number is what people report, and reports are what get a WhatsApp number
 * banned - a message that opens with your actual name reads as something
 * addressed to you rather than a blast.
 *
 * Deliberately not Meta's `{{1}}` syntax. Those are positional template
 * variables with the SAME value for every recipient, filled on Meta's side;
 * this is per person and filled here. Using the same notation for both would
 * invite somebody to put a name in `{{1}}` and send four hundred people a
 * message greeting them by one stranger's name.
 */

/** The token an operator types in the message body. */
const NAME_TOKEN = /\{name\}/gi;

/**
 * The part of a full name to greet somebody by.
 *
 * The first word, which is right for "Daniel Ngue" and wrong for a name
 * written surname-first - a convention that is common in Cameroon and that
 * nothing in a stored string distinguishes from the other order. Getting it
 * wrong still greets them by a name that is genuinely theirs, which is why
 * this takes the simple reading rather than guessing.
 */
export function firstNameOf(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  // A name that is only punctuation or a stray character is not a name; better
  // to greet nobody than to greet "-".
  return /\p{L}/u.test(first) ? first : '';
}

/**
 * Fill `{name}` in a message body for one recipient.
 *
 * When there is no usable name the token is removed AND the punctuation left
 * behind is tidied, so "Hi {name}, this is Bizik" becomes "Hi, this is Bizik"
 * rather than "Hi , this is Bizik". That matters more than it looks: a stray
 * space before a comma is exactly the tell that a message was machine-made,
 * and this is a channel where looking automated gets the number reported.
 *
 * Works the same in French - "Bonjour {name}, c'est Bizik" degrades to
 * "Bonjour, c'est Bizik".
 */
export function personalise(body: string, fullName: string | null | undefined): string {
  const first = firstNameOf(fullName);
  if (first) return body.replace(NAME_TOKEN, first);

  return (
    body
      .replace(NAME_TOKEN, '')
      // " ," -> "," and " ." -> "." , including before ! ? : ;
      .replace(/[ \t]+([,.!?;:])/g, '$1')
      // Collapse the double space the removal leaves mid-sentence.
      .replace(/[ \t]{2,}/g, ' ')
      // And a space stranded at the start of a line.
      .replace(/^[ \t]+/gm, '')
  );
}

/** Does this body ask for a name at all? Used to decide whether to look one up. */
export function usesName(body: string | null | undefined): boolean {
  if (!body) return false;
  NAME_TOKEN.lastIndex = 0;
  return NAME_TOKEN.test(body);
}
