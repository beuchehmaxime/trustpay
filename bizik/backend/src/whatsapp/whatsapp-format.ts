/**
 * House style for everything BiZik says on WhatsApp.
 *
 * WhatsApp does not speak markdown. `**bold**` arrives as literal asterisks,
 * and a model that writes markdown next to our own *bold* is how a message
 * ends up with three asterisks in a row. The system prompt asks the assistant
 * not to do it, but a prompt is advice; this is the enforcement, and every
 * outbound message goes through it.
 *
 * WhatsApp's own markup is single-character and is deliberately left alone:
 * *bold*, _italic_, ~strike~.
 */

/** Markdown emphasis reduced to WhatsApp's single marks, dashes to commas. */
export function tidyMarkup(text: string): string {
  return (
    text
      // "### Heading" is markdown; WhatsApp shows the hashes.
      .replace(/^ {0,3}#{1,6}[ \t]+/gm, '')
      // **bold** and ***both*** collapse onto WhatsApp's single asterisk.
      .replace(/\*{2,}/g, '*')
      .replace(/_{2,}/g, '_')
      // Markdown bullets become the bullet we use everywhere else.
      .replace(/^[ \t]*[-*][ \t]+/gm, '• ')
      // Em dash, en dash and the double hyphen all read as a comma here.
      .replace(/[ \t]*(?:[\u2014\u2013]|--)[ \t]*/g, ', ')
      // Whatever the above left behind.
      .replace(/[ \t]+([,.!?])/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()
  );
}

/**
 * Emoji, for text we did not write ourselves. Our own messages keep a small
 * set of status glyphs on purpose; the assistant's free-form replies get none,
 * because it has no sense of how many is too many.
 */
export function stripEmoji(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+/gm, '')
    .trim();
}
