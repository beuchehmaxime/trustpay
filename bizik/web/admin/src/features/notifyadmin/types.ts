/** Operator notification & broadcast types - mirrors backend AdminNotifyService. */

export type AdminEventType =
  | 'KYC_SUBMITTED'
  | 'KYC_ESCALATED'
  | 'AML_ALERT'
  | 'SANCTIONS_MATCH'
  | 'ACCOUNT_FROZEN'
  | 'DISPUTE_FILED'
  | 'DISPUTE_ESCALATED'
  | 'PAYOUT_PENDING'
  | 'ESCROW_ADJUSTED'
  | 'OPERATOR_ADDED'
  | 'ROLE_CHANGED'
  | 'SETTINGS_CHANGED'
  | 'REPORT_READY'
  | 'BROADCAST_SENT'
  | 'SYSTEM';

export type AdminEventSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export interface AdminNotification {
  id: string;
  type: AdminEventType;
  severity: AdminEventSeverity;
  title: string;
  body: string;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
}

export interface AdminNotifyFeed {
  items: AdminNotification[];
  unread: number;
}

export interface AdminNotifyStats {
  total: number;
  unread: number;
  byType: Record<string, number>;
}

export type BroadcastAudience = 'ALL' | 'FREELANCERS' | 'CLIENTS';
export type BroadcastCategory = 'SYSTEM' | 'PAYMENT' | 'CONTRACT' | 'SECURITY';
export type NotifyChannel = 'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS';

export interface BroadcastInput {
  title: string;
  body: string;
  audience: BroadcastAudience;
  category: BroadcastCategory;
  channels: NotifyChannel[];
}

export interface BroadcastRow {
  id: string;
  title: string;
  audience: string;
  category: string;
  channels: string[];
  recipients: number;
  sentBy: string;
  createdAt: string;
}

export type AudienceCounts = Record<BroadcastAudience, number>;

export interface NotificationTemplate {
  key: string;
  name: string;
  category: string;
  channels: NotifyChannel[];
  subject: string;
  body: string;
  variables: string[];
  updatedAt: string;
}

export interface TemplateUpdateInput {
  subject: string;
  body: string;
  channels: NotifyChannel[];
}

export type MessageReportSource = 'RECIPIENT' | 'CLASSIFIER';

export type ModerationStatusFilter = 'PENDING' | 'RESOLVED';

export interface ModerationItem {
  id: string;
  reason: string;
  source: MessageReportSource;
  status: 'PENDING' | 'REMOVED' | 'DISMISSED';
  senderId: string;
  senderName: string;
  recipientId: string | null;
  recipientName: string;
  contractId: string | null;
  contractTitle: string;
  messageBody: string;
  messageRemoved: boolean;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ModerationMessage {
  id: string;
  senderName: string;
  body: string;
  removed: boolean;
  isReported: boolean;
  createdAt: string;
}

export interface ModerationThread {
  reportedMessageId: string;
  messages: ModerationMessage[];
}
