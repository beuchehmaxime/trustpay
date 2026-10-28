import { cn } from '@/lib/utils';
import { STATUS_TONE, toneClass, type StatusTone } from '@/lib/status-tone';

const TONES: Record<string, StatusTone> = {
  ACTIVE: 'positive',
  PENDING: 'warning',
  SUSPENDED: 'negative',
  FROZEN: 'info',
  CLOSED: 'neutral',
};

/** Colour-coded account status pill (uppercase, matching the platform design). */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase',
        STATUS_TONE[TONES[status]] ?? toneClass('neutral'),
        className,
      )}
    >
      {status}
    </span>
  );
}
