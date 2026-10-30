import { Fragment } from 'react';

/**
 * Render what the assistant says.
 *
 * The model writes light markdown: a bold amount, a bold handle, the
 * occasional bullet. Rendered as plain text that arrives on screen as
 * `**500,000 FCFA**`, which looks like a bug and is the first thing anyone
 * notices.
 *
 * Proposal summaries come from the backend rather than the model and use
 * WhatsApp's convention instead, one asterisk each side. Both are handled here
 * by one formatter, because two of these would drift apart and the asterisks
 * would come back in whichever one was forgotten.
 *
 * This is deliberately not a markdown library. The assistant's prompt allows
 * exactly two things - emphasis and bullets - and a parser that also does
 * headings, links, images and raw HTML is a far larger surface for text that
 * originates from a model and quotes content written by other users.
 */

/** `**bold**` first, so a double asterisk is never read as two singles. */
const EMPHASIS = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;

function withEmphasis(line: string, keyPrefix: string) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  EMPHASIS.lastIndex = 0;
  while ((match = EMPHASIS.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push(line.slice(lastIndex, match.index));
    parts.push(
      <strong key={`${keyPrefix}-${match.index}`} className="font-semibold">
        {match[1] ?? match[2]}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) parts.push(line.slice(lastIndex));

  // An unmatched asterisk is left exactly as typed rather than stripped: it
  // may be part of what someone actually wrote.
  return parts.length > 0 ? parts : [line];
}

export function AssistantText({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <>
      {lines.map((line, index) => {
        const trimmed = line.trim();

        // A blank line is a paragraph break, so it has to take up space.
        if (!trimmed) return <div key={index} className="h-2" />;

        const bullet = /^[•\-*]\s+/.test(trimmed) ? trimmed.replace(/^[•\-*]\s+/, '') : null;
        if (bullet) {
          return (
            <div key={index} className="flex gap-2">
              <span aria-hidden className="select-none">
                •
              </span>
              <span className="min-w-0 flex-1">{withEmphasis(bullet, String(index))}</span>
            </div>
          );
        }

        return <Fragment key={index}>{withEmphasis(trimmed, String(index))}</Fragment>;
      })}
    </>
  );
}
