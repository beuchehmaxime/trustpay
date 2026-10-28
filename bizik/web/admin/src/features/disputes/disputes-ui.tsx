import { cn } from '@/lib/utils';
import { STATUS_TONE, type StatusTone } from '@/lib/status-tone';
import type { DisputeStatusValue, RulingType } from './types';

const STATUS_TONES: Record<DisputeStatusValue, StatusTone> = {
  FILED: 'info',
  AWAITING_RESPONSE: 'info',
  UNDER_REVIEW: 'warning',
  ESCALATED: 'negative',
  RESOLVED: 'positive',
  AUTO_RULED: 'positive',
};

export function DisputeStatusBadge({
  status,
  label,
}: {
  status: DisputeStatusValue;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        STATUS_TONE[STATUS_TONES[status]],
      )}
    >
      {label}
    </span>
  );
}

const RULING_LABEL: Record<RulingType, string> = {
  FULL_RELEASE: 'Release to freelancer',
  FULL_REFUND: 'Refund to client',
  PARTIAL_SPLIT: 'Split',
};

export function rulingLabel(ruling: RulingType): string {
  return RULING_LABEL[ruling];
}

export function money(amount: number, currency: string | null): string {
  if (!currency) return amount.toLocaleString();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}
