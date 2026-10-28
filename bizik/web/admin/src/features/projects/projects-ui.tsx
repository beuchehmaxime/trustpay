import { cn } from '@/lib/utils';
import { STATUS_TONE, type StatusTone } from '@/lib/status-tone';
import type { ContractStatusValue, MilestoneStatusValue } from './types';

const CONTRACT_STATUS_TONES: Record<ContractStatusValue, StatusTone> = {
  DRAFT: 'neutral',
  INVITED: 'neutral',
  UNDER_REVIEW: 'warning',
  SIGNED: 'info',
  FUNDED: 'info',
  IN_PROGRESS: 'info',
  IN_REVIEW: 'warning',
  DISPUTED: 'negative',
  COMPLETED: 'positive',
  CANCELLED: 'neutral',
};

export function ContractStatusBadge({
  status,
  label,
}: {
  status: ContractStatusValue;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        STATUS_TONE[CONTRACT_STATUS_TONES[status]],
      )}
    >
      {label}
    </span>
  );
}

const MILESTONE_STATUS_TONES: Record<MilestoneStatusValue, StatusTone> = {
  PENDING: 'neutral',
  FUNDED: 'info',
  ACTIVE: 'info',
  SUBMITTED: 'warning',
  APPROVED: 'warning',
  RELEASED: 'positive',
  DISPUTED: 'negative',
  CANCELLED: 'neutral',
};

export function MilestoneStatusBadge({
  status,
  label,
}: {
  status: MilestoneStatusValue;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        STATUS_TONE[MILESTONE_STATUS_TONES[status]],
      )}
    >
      {label}
    </span>
  );
}

/** Format an amount with its ISO currency, falling back gracefully. */
export function money(amount: number, currency: string | null): string {
  if (!currency) return amount.toLocaleString();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}
