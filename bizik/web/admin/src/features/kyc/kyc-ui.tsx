import { cn } from '@/lib/utils';
import { STATUS_TONE, type StatusTone } from '@/lib/status-tone';
import type { KycStatusValue } from './types';

const STATUS_TONES: Record<KycStatusValue, StatusTone> = {
  NOT_STARTED: 'neutral',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'warning',
  APPROVED: 'positive',
  REJECTED: 'negative',
};

/** Coloured status pill matching the KYC review design. */
export function KycStatusBadge({
  status,
  label,
}: {
  status: KycStatusValue;
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

/** Outlined pill showing the number of unresolved review flags. */
export function FlagBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center rounded-md border border-negative/30 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-negative uppercase">
      {count} flag{count > 1 ? 's' : ''}
    </span>
  );
}

/** A liveness/match score (stored 0-1) rendered as a coloured 0-100 number. */
export function scoreDisplay(value: number | null): { text: string; className: string } {
  if (value == null) return { text: '-', className: 'text-muted-foreground' };
  const pct = Math.round(value * 100);
  const className =
    pct >= 80 ? 'text-positive' : pct >= 65 ? 'text-amber-600' : 'text-negative';
  return { text: String(pct), className: cn('font-semibold', className) };
}

/** Human label for an ID-type enum value (e.g. NATIONAL_ID → "National ID"). */
export function idTypeLabel(idType: string | null): string {
  if (!idType) return '-';
  const map: Record<string, string> = {
    NATIONAL_ID: 'National ID',
    PASSPORT: 'Passport',
    DRIVERS_LICENSE: 'Driver’s licence',
    DRIVERS_LICENCE: 'Driver’s licence',
    RESIDENCE_PERMIT: 'Residence permit',
    VOTER_ID: 'Voter ID',
  };
  return (
    map[idType] ??
    idType
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}
