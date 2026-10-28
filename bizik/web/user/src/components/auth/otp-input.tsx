'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

import { cn } from '@/lib/utils';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
}

/** Segmented one-time-code input: N boxes, auto-advance, backspace + paste. */
export function OtpInput({ value, onChange, length = 6, autoFocus = false }: OtpInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  const focusAt = (index: number) => inputs.current[index]?.focus();

  const setDigit = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const chars = Array.from({ length }, (_, position) => value[position] ?? '');
    chars[index] = digit;
    onChange(chars.join(''));
    if (digit && index < length - 1) focusAt(index + 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) focusAt(index - 1);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    focusAt(Math.min(pasted.length, length - 1));
  };

  return (
    // `min-w-0` on the row as well as the cells: without it the row itself
    // refuses to shrink below its children's content width, and six cells push
    // the card - and with it the whole page - off the right of a phone screen.
    <div className="flex w-full min-w-0 justify-center gap-1.5 sm:gap-2.5" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={digit}
          autoFocus={autoFocus && index === 0}
          onChange={(event) => setDigit(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          className={cn(
            // Flexible cells: they fill the row evenly and shrink to fit, so a
            // six-digit code stays inside the card at any width. `basis-0` with
            // `flex-1` makes the split even regardless of content, and the
            // smaller text on narrow screens keeps a digit from setting a floor
            // under the cell width.
            'aspect-square min-w-0 flex-1 basis-0 rounded-2xl border-[1.5px] text-center text-lg font-extrabold text-ink outline-none transition sm:text-2xl',
            'max-w-13 p-0',
            digit ? 'border-brand-500 bg-brand-50/40' : 'border-hairline bg-[#F6F8FC]',
            'focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10',
          )}
        />
      ))}
    </div>
  );
}
