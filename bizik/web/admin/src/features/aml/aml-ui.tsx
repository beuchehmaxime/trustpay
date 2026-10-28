import { cn } from '@/lib/utils';
import { STATUS_TONE, type StatusTone } from '@/lib/status-tone';
import type { AmlAlertStatusValue, AmlAlertTypeValue } from './types';

const STATUS_TONES: Record<AmlAlertStatusValue, StatusTone> = {
  NEW: 'info',
  UNDER_REVIEW: 'warning',
  ESCALATED: 'negative',
  CLEARED: 'positive',
};

/** Coloured AML case-status pill. */
export function AmlStatusBadge({
  status,
  label,
}: {
  status: AmlAlertStatusValue;
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

/** Sanctions/PEP types read as higher risk than behavioural ones. */
const HIGH_RISK: AmlAlertTypeValue[] = ['SANCTIONS_MATCH', 'STRUCTURING'];

/** Outlined alert-type tag; high-risk types render in red. */
export function AmlTypeBadge({
  type,
  label,
}: {
  type: AmlAlertTypeValue;
  label: string;
}) {
  const highRisk = HIGH_RISK.includes(type);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        highRisk ? 'border-negative/30 text-negative' : 'border-hairline text-muted-foreground',
      )}
    >
      {label}
    </span>
  );
}

/** Small pill describing the subject account's current status. */
export function AccountStatusPill({ status }: { status: string }) {
  const tone: StatusTone =
    status === 'FROZEN' ? 'negative' : status === 'ACTIVE' ? 'positive' : 'neutral';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        STATUS_TONE[tone],
      )}
    >
      {status.toLowerCase()}
    </span>
  );
}
