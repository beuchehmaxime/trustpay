import type { ComponentType } from 'react';
import {
  Bell,
  Gavel,
  Megaphone,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  UserCog,
  Wallet,
} from 'lucide-react';

import type { AdminEventSeverity, AdminEventType } from './types';

interface TypeMeta {
  icon: ComponentType<{ className?: string }>;
  label: string;
}

/** Icon + human label per event type. */
export const TYPE_META: Record<AdminEventType, TypeMeta> = {
  KYC_SUBMITTED: { icon: ShieldCheck, label: 'KYC submission' },
  KYC_ESCALATED: { icon: ShieldCheck, label: 'KYC escalation' },
  AML_ALERT: { icon: ShieldAlert, label: 'AML alert' },
  SANCTIONS_MATCH: { icon: ShieldAlert, label: 'Sanctions match' },
  ACCOUNT_FROZEN: { icon: Snowflake, label: 'Account frozen' },
  DISPUTE_FILED: { icon: Gavel, label: 'Dispute filed' },
  DISPUTE_ESCALATED: { icon: Gavel, label: 'Dispute escalated' },
  PAYOUT_PENDING: { icon: Wallet, label: 'Payout pending' },
  ESCROW_ADJUSTED: { icon: Wallet, label: 'Escrow adjusted' },
  OPERATOR_ADDED: { icon: UserCog, label: 'Operator added' },
  ROLE_CHANGED: { icon: UserCog, label: 'Role changed' },
  SETTINGS_CHANGED: { icon: Settings, label: 'Settings changed' },
  REPORT_READY: { icon: ScrollText, label: 'Report ready' },
  BROADCAST_SENT: { icon: Megaphone, label: 'Broadcast' },
  SYSTEM: { icon: Bell, label: 'System' },
};

/** Tailwind classes for the icon chip per severity. */
export const SEVERITY_TONE: Record<AdminEventSeverity, string> = {
  INFO: 'bg-blue-50 text-blue-600',
  SUCCESS: 'bg-emerald-50 text-emerald-600',
  WARNING: 'bg-amber-50 text-amber-600',
  CRITICAL: 'bg-rose-50 text-rose-600',
};

export const SEVERITY_LABEL: Record<AdminEventSeverity, string> = {
  INFO: 'Info',
  SUCCESS: 'Success',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
};

/** Human labels for delivery channels. */
export const CHANNEL_LABEL: Record<string, string> = {
  IN_APP: 'In-app',
  EMAIL: 'Email',
  PUSH: 'Push',
  SMS: 'SMS',
};

/** Compact "2m ago / 3h ago / 5d ago" relative time. */
export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
