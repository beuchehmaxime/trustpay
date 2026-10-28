import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Semantic tones from the handoff's status → colour mapping. */
export type StatusTone =
  | 'neutral' // Pending
  | 'warning' // Awaiting funding / Payout processing / pending money
  | 'positive' // Funded / Released / Approved / Completed / Resolved / Verified
  | 'brand' // In progress / Open / Default
  | 'cyan' // In review
  | 'negative'; // Disputed / Under review / error

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'bg-pending-bg text-muted-foreground',
  warning: 'bg-warning-bg text-warning-text',
  positive: 'bg-positive-bg text-positive-text',
  brand: 'bg-brand-50 text-[#1D4ED8]',
  cyan: 'bg-cyan-bg text-cyan-text',
  negative: 'bg-negative-bg text-negative-text',
};

/** Map a status label (backend/UI string) to its tone. */
export function statusTone(status: string): StatusTone {
  const key = status.toLowerCase();
  if (['pending'].includes(key)) return 'neutral';
  if (['awaiting funding', 'payout processing', 'processing'].includes(key)) return 'warning';
  if (
    ['funded', 'released', 'approved', 'completed', 'resolved', 'verified'].includes(key)
  ) {
    return 'positive';
  }
  if (['in review', 'submitted'].includes(key)) return 'cyan';
  if (['disputed', 'under review'].includes(key)) return 'negative';
  return 'brand'; // in progress / open / default
}

/**
 * Status pill - colour is always paired with a label (never colour alone).
 * Pass either an explicit `tone` or let `statusTone(label)` infer it.
 */
export function StatusPill({
  children,
  tone,
  icon,
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  icon?: ReactNode;
  className?: string;
}) {
  const resolved = tone ?? statusTone(String(children));
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5',
        'text-[10.5px] font-bold tracking-tight',
        TONE_CLASS[resolved],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
