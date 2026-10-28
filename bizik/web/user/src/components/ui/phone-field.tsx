'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface PhoneCountry {
  name: string;
  flag: string;
  dialCode: string;
}

/** BiZik's target markets - the only country codes offered for now. */
const COUNTRIES: PhoneCountry[] = [
  { name: 'Nigeria', flag: '🇳🇬', dialCode: '+234' },
  { name: 'Ghana', flag: '🇬🇭', dialCode: '+233' },
  { name: 'Cameroon', flag: '🇨🇲', dialCode: '+237' },
  { name: 'Chad', flag: '🇹🇩', dialCode: '+235' },
  { name: 'Gabon', flag: '🇬🇦', dialCode: '+241' },
  { name: 'Central African Republic', flag: '🇨🇫', dialCode: '+236' },
  { name: 'Equatorial Guinea', flag: '🇬🇶', dialCode: '+240' },
  { name: 'United States', flag: '🇺🇸', dialCode: '+1' },
  { name: 'United Kingdom', flag: '🇬🇧', dialCode: '+44' },
  { name: 'France', flag: '🇫🇷', dialCode: '+33' },
  { name: 'Germany', flag: '🇩🇪', dialCode: '+49' },
];

/**
 * Where a phone field starts when the value does not say.
 *
 * Named rather than taken from COUNTRIES[0]: the list is ordered for the
 * picker, so reordering it would silently change what every signup, deal
 * invite and payout number defaults to - a one-line edit with a product-wide
 * effect nobody would connect to it.
 *
 * Cameroon because it is the only market currently enabled.
 */
const DEFAULT_DIAL_CODE = '+237';

/** Longest dial-code prefix match wins (so +1 doesn't shadow +12…). */
function detect(value: string): PhoneCountry | undefined {
  return [...COUNTRIES]
    .filter((country) => value.startsWith(country.dialCode))
    .sort((first, second) => second.dialCode.length - first.dialCode.length)[0];
}

interface PhoneFieldProps {
  label?: string;
  /** Full E.164-ish value, e.g. "+237650112233". */
  value: string;
  onChange: (value: string) => void;
  /** Reports the selected country (initial + on change) - e.g. to derive currency. */
  onCountryChange?: (country: PhoneCountry) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Single joined phone field: a country selector (flag + dial code + chevron) on
 * the left, a divider, and the local number on the right - mirrors the mobile
 * `PhoneInput`. Emits the full number so callers store one E.164-ish string; a
 * leading 0 on the local part is dropped (NG/GH national-format convention).
 */
export function PhoneField({
  label,
  value,
  onChange,
  onCountryChange,
  error,
  placeholder = '6 12 34 56 78',
  disabled = false,
}: PhoneFieldProps) {
  const detected = detect(value);
  const country =
    detected ??
    COUNTRIES.find((entry) => entry.dialCode === DEFAULT_DIAL_CODE) ??
    COUNTRIES[0];
  const local = detected ? value.slice(detected.dialCode.length) : value.replace(/^\+/, '');

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Report the initial country once so the parent can derive currency/locale.
  useEffect(() => {
    onCountryChange?.(country);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function emit(dialCode: string, localPart: string) {
    const digits = localPart.replace(/\D/g, '').replace(/^0+/, '');
    onChange(`${dialCode}${digits}`);
  }

  function pickCountry(next: PhoneCountry) {
    setOpen(false);
    onCountryChange?.(next);
    emit(next.dialCode, local);
  }

  return (
    <div className="grid gap-1.5">
      {label ? <label className="text-[13px] font-semibold text-ink">{label}</label> : null}

      <div ref={ref} className="relative">
        <div
          className={cn(
            'flex h-12 items-center rounded-xl border bg-surface transition focus-within:ring-2',
            error
              ? 'border-negative focus-within:border-negative focus-within:ring-negative-bg'
              : 'border-hairline focus-within:border-brand-500 focus-within:ring-brand-100',
            disabled && 'opacity-60',
          )}
        >
          <button
            type="button"
            onClick={() => !disabled && setOpen((value) => !value)}
            disabled={disabled}
            aria-label="Country code"
            className="flex h-full items-center gap-1.5 rounded-l-xl pl-3.5 pr-2 text-[15px] font-semibold text-ink"
          >
            <span className="text-base leading-none">{country.flag}</span>
            <span>{country.dialCode}</span>
            {!disabled ? <ChevronDown className="size-4 text-muted-foreground" /> : null}
          </button>

          <span className="h-6 w-px bg-hairline" />

          {/* w-0 + flex-1: an <input> has a built-in width of about 20 characters
              that still counts toward how narrow the form can go, even with
              min-w-0. It held the auth pages at ~390px, so narrow phones zoomed
              out. With w-0 the input starts at nothing and flex-1 fills the row. */}
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={placeholder}
            value={local}
            disabled={disabled}
            onChange={(event) => emit(country.dialCode, event.target.value)}
            className="h-full w-0 min-w-0 flex-1 rounded-r-xl bg-transparent pl-3 pr-4 text-[15px] text-ink outline-none placeholder:text-subtle"
          />
        </div>

        {open ? (
          <div className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 absolute left-0 top-[calc(100%+6px)] z-30 max-h-72 w-64 overflow-auto rounded-2xl border border-hairline bg-surface p-1.5 shadow-[0_20px_44px_-16px_rgba(11,31,58,0.28)] duration-150">
            {COUNTRIES.map((option) => {
              const active = option.dialCode === country.dialCode && option.name === country.name;
              return (
                <button
                  key={option.name}
                  type="button"
                  onClick={() => pickCountry(option)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                    active ? 'bg-brand-50' : 'hover:bg-muted/50',
                  )}
                >
                  <span className="text-lg leading-none">{option.flag}</span>
                  <span className={cn('flex-1 text-[14px]', active ? 'font-bold text-brand-700' : 'text-ink')}>
                    {option.name}
                  </span>
                  <span className={cn('text-[13px]', active ? 'text-brand-600' : 'text-muted-foreground')}>
                    {option.dialCode}
                  </span>
                  {active ? <Check className="size-4 shrink-0 text-brand-600" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-[13px] text-negative">{error}</p> : null}
    </div>
  );
}
