/** Operator view of the WhatsApp assistant - see backend src/whatsappadmin. */

export interface WhatsAppDayVolume {
  date: string;
  inbound: number;
  outbound: number;
}

export interface WhatsAppOverview {
  /** Serving right now: the env allows it AND the kill switch is on. */
  enabled: boolean;
  /** Configured at all (env). False means no toggle can bring it up. */
  envEnabled: boolean;
  /** The operator kill switch itself. */
  settingEnabled: boolean;
  windowDays: number;
  totals: { inbound: number; outbound: number; activeNumbers: number };
  channels: {
    linked: number;
    locked: number;
    optedOut: number;
    withPin: number;
    /** Inside Meta's 24-hour window, so free-form messages can still land. */
    reachableNow: number;
  };
  series: WhatsAppDayVolume[];
}

export interface WhatsAppMessageRow {
  id: string;
  /** Masked to the last four digits - enough to correlate, not a directory. */
  phone: string;
  user: { name: string | null; username: string | null } | null;
  direction: 'INBOUND' | 'OUTBOUND';
  kind: string;
  body: string | null;
  createdAt: string;
}

/** One contact's conversation, as the inbox list shows it. */
export interface WhatsAppConversation {
  /** Opaque and stable - never the phone number itself. */
  id: string;
  /** Masked to the last four digits. */
  phone: string;
  user: { id: string; name: string; username: string | null } | null;
  linked: boolean;
  optIn: boolean;
  locked: boolean;
  hasPin: boolean;
  /** Inside Meta's 24-hour window, so a free-form reply can still be delivered. */
  reachable: boolean;
  messages: { total: number; inbound: number; outbound: number };
  lastMessage: {
    direction: 'INBOUND' | 'OUTBOUND';
    kind: string;
    preview: string | null;
    createdAt: string;
  } | null;
  firstMessageAt: string | null;
  lastInboundAt: string | null;
}

export type WhatsAppConversationFilter =
  | 'all'
  | 'guests'
  | 'linked'
  | 'locked'
  | 'optedOut'
  | 'reachable';

export interface WhatsAppConversationPage {
  conversations: WhatsAppConversation[];
  total: number;
}

export interface WhatsAppThreadMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  kind: string;
  body: string | null;
  createdAt: string;
}

export interface WhatsAppThread {
  conversation: WhatsAppConversation | null;
  messages: WhatsAppThreadMessage[];
  hasMore: boolean;
}

// ---- Outreach campaigns -----------------------------------------------------
// The platform starting a conversation with a group of users, which WhatsApp
// only allows through a pre-approved template. See backend campaign.service.ts.

export interface CampaignSegment {
  key: string;
  label: string;
  description: string;
  /** How many reachable users are in it right now. */
  count: number;
}

export interface CampaignPreview {
  segment: string;
  label: string;
  description: string;
  total: number;
  /** In the segment but with WhatsApp messages switched off. */
  optedOut: number;
  reachable: number;
  /** True when the segment is larger than one campaign may send to. */
  capped: boolean;
  sample: { name: string | null; phone: string; optedOut: boolean }[];
}

export type CampaignStatus = 'DRAFT' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type CampaignRecipientStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED_OPTOUT';

export interface Campaign {
  id: string;
  name: string;
  segment: string;
  segmentLabel: string;
  template: string;
  language: string;
  variables: string[];
  note: string | null;
  status: CampaignStatus;
  audienceSize: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface CampaignDetail extends Campaign {
  /** Recipients a stopped campaign never reached. */
  queuedCount: number;
  /** Failures worth another attempt - excludes numbers with no WhatsApp account. */
  retryableFailed: number;
  /** The two added together: exactly what pressing Retry would pick up. */
  retryable: number;
  recipients: {
    id: string;
    /** Masked - an operator needs outcomes, not a contact list. */
    phone: string;
    status: CampaignRecipientStatus;
    error: string | null;
    sentAt: string | null;
  }[];
}

export interface SendCampaignPayload {
  name: string;
  segment: string;
  template: string;
  /** The message text, for a rail that sends prose rather than a template. */
  body?: string;
  language?: string;
  variables?: string[];
  note?: string;
}
