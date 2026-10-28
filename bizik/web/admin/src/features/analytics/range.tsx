'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The reporting window, shared by every product page in the section.
 *
 * Held in React state on the section layout rather than in the URL. The layout
 * does not unmount when moving between tabs, so a window chosen on Audience is
 * still in force on Funnel - which is what someone comparing the two expects.
 * The URL alternative would survive a refresh, but it also needs a Suspense
 * boundary around every page to keep prerendering, for a window that is reset to
 * 30 days on the next visit anyway.
 */

export const RANGE_OPTIONS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

interface RangeValue {
  days: number;
  setDays: (days: number) => void;
}

const RangeContext = createContext<RangeValue>({ days: 30, setDays: () => undefined });

export function RangeProvider({ children }: { children: ReactNode }) {
  const [days, setDays] = useState(30);
  const value = useMemo(() => ({ days, setDays }), [days]);
  return <RangeContext.Provider value={value}>{children}</RangeContext.Provider>;
}

export function useRange(): RangeValue {
  return useContext(RangeContext);
}

/** The segmented control. Rendered by the layout, above whichever tab is open. */
export function RangePicker() {
  const { days, setDays } = useRange();
  return (
    <div className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option.days}
          type="button"
          onClick={() => setDays(option.days)}
          aria-pressed={days === option.days}
          className={cn(
            'rounded-[6px] px-3 py-1.5 text-[12.5px] font-medium transition',
            days === option.days
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-muted-foreground hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
