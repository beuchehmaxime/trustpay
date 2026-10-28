'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The shared vocabulary for the business analytics section.
 *
 * Everything on these pages is built from these few pieces so that six separate
 * pages still read as one product. The previous single page invented a slightly
 * different card, label size and spacing in every block, which is most of why it
 * looked unfinished: nothing lined up, and nothing established a hierarchy.
 *
 * Sizes here are deliberately larger than what was there before. An analytics
 * page is read, not scanned past, and 11px labels on a 1440px screen are a
 * density that serves the author rather than the reader.
 */

/* ----------------------------------------------------------------- surfaces */

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'shadow-card overflow-hidden rounded-xl border border-hairline bg-surface',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-6 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('p-6', className)}>{children}</div>;
}

/* -------------------------------------------------------------------- stats */

/**
 * One number.
 *
 * `value` of `null` means the number cannot be computed, and says so rather than
 * printing a zero. That distinction is the whole point: a dashboard reporting 0%
 * churn because it has no cohorts yet is worse than one admitting it does not
 * know, because somebody will act on the zero.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  size = 'md',
}: {
  label: string;
  value: number | string | null;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'brand';
  size?: 'md' | 'lg';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive-text'
      : tone === 'negative'
        ? 'text-negative'
        : tone === 'brand'
          ? 'text-brand-600'
          : 'text-ink';

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {value === null ? (
        <p className="mt-1.5 text-[14px] font-medium text-subtle">Not available</p>
      ) : (
        <p
          // Never truncated. A clipped "FCFA 192,8..." is not a smaller version
          // of the number, it is a different number, and on a money figure that
          // is the one kind of wrong a dashboard must not be. If a cell is too
          // narrow the value wraps at the space after the currency instead.
          className={cn(
            'mt-1.5 font-bold wrap-break-word tabular-nums',
            size === 'lg' ? 'text-[26px] leading-tight' : 'text-[22px] leading-tight',
            toneClass,
          )}
        >
          {typeof value === 'number' ? value.toLocaleString('en-US') : value}
        </p>
      )}
      {hint ? <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A row of stats inside a card, evenly divided with hairlines between them. */
export function StatRow({
  children,
  columns = 4,
}: {
  children: ReactNode;
  columns?: 3 | 4 | 5 | 6;
}) {
  const grid = {
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-3 lg:grid-cols-5',
    6: 'sm:grid-cols-3 lg:grid-cols-6',
  }[columns];
  return <div className={cn('grid grid-cols-2 gap-x-6 gap-y-7', grid)}>{children}</div>;
}

/* ----------------------------------------------------------------- messages */

export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning';
  children: ReactNode;
}) {
  const warning = tone === 'warning';
  const Icon = warning ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-lg border p-3.5 text-[13px] leading-relaxed',
        warning
          ? 'border-amber-200 bg-amber-50/70 text-amber-900'
          : 'border-brand-100 bg-brand-50/60 text-brand-900',
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', warning ? 'text-amber-600' : 'text-brand-500')} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Plain explanatory prose under a block. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-muted-foreground">{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-10 text-center text-[13px] text-muted-foreground">{children}</p>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function Failed({ what }: { what: string }) {
  return (
    <Card>
      <CardBody>
        <p className="py-10 text-center text-[13px] text-muted-foreground">
          Could not load {what}. Refresh the page, and if it keeps failing the API is not
          reachable from here.
        </p>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ tables */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={cn(
        'border-b border-hairline px-3 py-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase',
        align === 'right' && 'text-right',
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td
      className={cn(
        'border-b border-hairline/60 px-3 py-3 text-ink',
        align === 'right' && 'text-right tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  );
}

/* --------------------------------------------------------------- formatting */

/** FCFA has no subunit in practice, so no decimals are ever shown. */
export function xaf(amount: number): string {
  return `FCFA ${Math.round(amount).toLocaleString('en-US')}`;
}

/** Compact money for axis labels and dense tiles: 1.2M rather than 1,200,000. */
export function xafShort(amount: number): string {
  const rounded = Math.round(amount);
  if (Math.abs(rounded) >= 1_000_000) return `${(rounded / 1_000_000).toFixed(1)}M`;
  if (Math.abs(rounded) >= 1_000) return `${Math.round(rounded / 1_000)}k`;
  return String(rounded);
}

export function percent(ratio: number | null, digits = 0): string | null {
  return ratio === null ? null : `${(ratio * 100).toFixed(digits)}%`;
}
