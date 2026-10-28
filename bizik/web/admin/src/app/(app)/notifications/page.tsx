'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ExternalLink,
  Inbox,
  Loader2,
  Megaphone,
  MessageSquareWarning,
  MessagesSquare,
  Send,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  useAudienceCounts,
  useBroadcasts,
  useModerationActions,
  useModerationQueue,
  useModerationThread,
  useNotifications,
  useNotifyActions,
  useNotifyStats,
  useSendBroadcast,
  useTemplateActions,
  useTemplates,
} from '@/features/notifyadmin/hooks';
import {
  CHANNEL_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  TYPE_META,
  timeAgo,
} from '@/features/notifyadmin/notifyadmin-ui';
import type {
  AdminEventType,
  AdminNotification,
  BroadcastAudience,
  BroadcastCategory,
  ModerationItem,
  NotificationTemplate,
  NotifyChannel,
} from '@/features/notifyadmin/types';

type TabKey = 'inbox' | 'templates' | 'broadcast' | 'moderation';

export default function NotificationsPage() {
  const canManage = usePermission('notifications.manage');
  const canBroadcast = usePermission('broadcasts.send');
  const canModerate = usePermission('messages.moderate');
  const [tab, setTab] = useState<TabKey>('inbox');

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: 'inbox', label: 'Inbox', icon: <Inbox className="size-4" />, show: true },
    { key: 'templates', label: 'Templates', icon: <Bell className="size-4" />, show: canManage },
    { key: 'broadcast', label: 'Broadcasts', icon: <Megaphone className="size-4" />, show: canBroadcast },
    {
      key: 'moderation',
      label: 'Moderation',
      icon: <MessageSquareWarning className="size-4" />,
      show: canModerate,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase">
          <span className="text-muted-foreground">Insights</span>{' '}
          <span className="text-ink">Notifications</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your alerts, editable templates, broadcasts to users, and in-contract message moderation.
        </p>
      </div>

      <div className="flex gap-1 border-b border-hairline">
        {tabs
          .filter((entry) => entry.show)
          .map((entry) => (
            <TabButton
              key={entry.key}
              active={tab === entry.key}
              onClick={() => setTab(entry.key)}
              icon={entry.icon}
            >
              {entry.label}
            </TabButton>
          ))}
      </div>

      {tab === 'inbox' ? <InboxTab /> : null}
      {tab === 'templates' && canManage ? <TemplatesTab /> : null}
      {tab === 'broadcast' && canBroadcast ? <BroadcastTab /> : null}
      {tab === 'moderation' && canModerate ? <ModerationTab /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Inbox */

const TYPE_FILTERS: { value: AdminEventType | ''; label: string }[] = [
  { value: '', label: 'All events' },
  { value: 'AML_ALERT', label: 'AML alerts' },
  { value: 'SANCTIONS_MATCH', label: 'Sanctions matches' },
  { value: 'ACCOUNT_FROZEN', label: 'Account freezes' },
  { value: 'KYC_SUBMITTED', label: 'KYC submissions' },
  { value: 'DISPUTE_FILED', label: 'Disputes filed' },
  { value: 'DISPUTE_ESCALATED', label: 'Disputes escalated' },
  { value: 'PAYOUT_PENDING', label: 'Payouts pending' },
  { value: 'BROADCAST_SENT', label: 'Broadcasts' },
];

function InboxTab() {
  const router = useRouter();
  const [type, setType] = useState<AdminEventType | ''>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [detail, setDetail] = useState<AdminNotification | null>(null);
  const { data: stats } = useNotifyStats();
  const { data, isLoading, isError, error } = useNotifications({
    type: type || undefined,
    unread: unreadOnly || undefined,
  });
  const { markRead, markAllRead } = useNotifyActions();
  const notifications = data ?? [];

  /** Open the detail panel and mark the notification read. */
  function openDetail(notification: AdminNotification) {
    if (!notification.read) markRead.mutate(notification.id);
    setDetail({ ...notification, read: true });
  }

  /** Mark a single notification read without opening it. */
  function markOne(notification: AdminNotification) {
    if (!notification.read) markRead.mutate(notification.id);
  }

  function goToLink(link: string) {
    setDetail(null);
    router.push(link);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats?.total} note="visible to you" />
        <StatCard label="Unread" value={stats?.unread} note="need attention" tone="warning" />
        <StatCard label="AML & sanctions" value={amlCount(stats?.byType)} note="risk events" tone="negative" />
        <StatCard label="Disputes" value={disputeCount(stats?.byType)} note="filed / escalated" tone="muted" />
      </div>

      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-col gap-2.5 border-b border-hairline px-6 py-4 lg:flex-row lg:items-center">
          <select
            value={type}
            onChange={(event) => setType(event.target.value as AdminEventType | '')}
            className="h-10 rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 lg:w-56"
          >
            {TYPE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => setUnreadOnly(event.target.checked)}
              className="size-4 rounded border-field text-brand-600 focus:ring-brand-500/20"
            />
            Unread only
          </label>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending || !stats?.unread}
            className="inline-flex items-center gap-1.5 rounded-lg border border-field px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted disabled:opacity-50"
          >
            <CheckCheck className="size-4" /> Mark all read
          </button>
        </div>

        {isError ? (
          <div className="p-6 text-sm text-destructive">{normaliseError(error).message}</div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Bell className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No notifications match your filters.</p>
          </div>
        ) : (
          <ul>
            {notifications.map((notification) => {
              const meta = TYPE_META[notification.type];
              const Icon = meta.icon;
              return (
                <li key={notification.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetail(notification)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openDetail(notification);
                      }
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-start gap-4 border-b border-hairline px-6 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/40',
                      !notification.read && 'bg-brand-50/40',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg',
                        SEVERITY_TONE[notification.severity],
                      )}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-ink">{notification.title}</p>
                        {!notification.read ? (
                          <span className="size-2 shrink-0 rounded-full bg-brand-500" />
                        ) : null}
                        <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {notification.body}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="text-xs text-muted-foreground/70">
                          {timeAgo(notification.createdAt)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                          Read more <ArrowRight className="size-3" />
                        </span>
                      </div>
                    </div>
                    {!notification.read ? (
                      <button
                        type="button"
                        title="Mark as read"
                        onClick={(event) => {
                          event.stopPropagation();
                          markOne(notification);
                        }}
                        className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-field text-muted-foreground transition-colors hover:bg-muted hover:text-ink"
                      >
                        <Check className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <NotificationDetail
        notification={detail}
        onClose={() => setDetail(null)}
        onGoToLink={goToLink}
      />
    </div>
  );
}

function NotificationDetail({
  notification,
  onClose,
  onGoToLink,
}: {
  notification: AdminNotification | null;
  onClose: () => void;
  onGoToLink: (link: string) => void;
}) {
  if (!notification) return null;
  const meta = TYPE_META[notification.type];
  const Icon = meta.icon;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-hairline bg-surface shadow-xl">
        <div className="flex items-start gap-3 border-b border-hairline p-5">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-lg',
              SEVERITY_TONE[notification.severity],
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-ink">{notification.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {meta.label}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  SEVERITY_TONE[notification.severity],
                )}
              >
                {SEVERITY_LABEL[notification.severity]}
              </span>
              <span className="text-[11px] text-muted-foreground/70">
                {new Date(notification.createdAt).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm whitespace-pre-line text-ink">{notification.body}</p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline p-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-field px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
          >
            Close
          </button>
          {notification.link ? (
            <button
              type="button"
              onClick={() => onGoToLink(notification.link as string)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Go to details <ExternalLink className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Templates */

const EDITABLE_CHANNELS: NotifyChannel[] = ['EMAIL', 'PUSH', 'SMS'];

const PREVIEW_SAMPLES: Record<string, string> = {
  first_name: 'Amara',
  currency: 'NGN',
  verify_link: 'app.bizik.cm/verify',
  reason: 'Document was blurry',
  actor: 'Sarah Chen',
  milestone: 'Design phase',
  amount: '1,500.00 USD',
  project: 'Brand website',
  method: 'MTN MoMo',
  reference: 'QTX-20260725-7F3A2B',
};

function fillVariables(text: string): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => PREVIEW_SAMPLES[name] ?? `{{${name}}}`);
}

function TemplatesTab() {
  const { data: templates, isLoading } = useTemplates(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selected = templates?.find((template) => template.key === selectedKey) ?? templates?.[0] ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!templates || templates.length === 0) {
    return <p className="text-sm text-muted-foreground">No templates configured.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* List */}
      <div className="space-y-2 lg:col-span-2">
        {templates.map((template) => {
          const active = template.key === (selected?.key ?? '');
          return (
            <button
              key={template.key}
              type="button"
              onClick={() => setSelectedKey(template.key)}
              className={cn(
                'flex w-full items-start justify-between gap-3 rounded-lg border p-4 text-left transition-colors',
                active
                  ? 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-400'
                  : 'border-hairline bg-surface hover:bg-muted/40',
              )}
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{template.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  edited {new Date(template.updatedAt).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {template.channels
                  .filter((channel) => channel !== 'IN_APP')
                  .map((channel) => (
                    <ChannelChip key={channel} channel={channel} />
                  ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Editor */}
      <div className="lg:col-span-3">
        {selected ? <TemplateEditor key={selected.key} template={selected} /> : null}
      </div>
    </div>
  );
}

function TemplateEditor({ template }: { template: NotificationTemplate }) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [channels, setChannels] = useState<NotifyChannel[]>(template.channels);
  const [testResult, setTestResult] = useState<string | null>(null);
  const { save, test } = useTemplateActions();

  function toggleChannel(channel: NotifyChannel) {
    setChannels((current) =>
      current.includes(channel) ? current.filter((entry) => entry !== channel) : [...current, channel],
    );
  }

  function onSave() {
    setTestResult(null);
    save.mutate({ key: template.key, input: { subject, body, channels } });
  }

  function onTest() {
    setTestResult(null);
    test.mutate(template.key, {
      onSuccess: (response) => setTestResult(`Test sent to ${response.sentTo}.`),
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-hairline bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Template - {template.name}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onTest}
            disabled={test.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-field px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted disabled:opacity-50"
          >
            {test.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send test
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={save.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save template
          </button>
        </div>
      </div>

      <Field label="Channels">
        <div className="flex flex-wrap gap-2">
          {EDITABLE_CHANNELS.map((channel) => {
            const on = channels.includes(channel);
            return (
              <button
                key={channel}
                type="button"
                onClick={() => toggleChannel(channel)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                  on
                    ? 'border-brand-400 bg-brand-50 text-brand-700'
                    : 'border-field bg-white text-muted-foreground hover:bg-muted',
                )}
              >
                {CHANNEL_LABEL[channel]}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Subject">
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
        />
      </Field>

      <Field label={`Body - variables in {{curly_braces}}`}>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={7}
          className="w-full resize-y rounded-lg border border-field bg-white px-3 py-2 font-mono text-[13px] text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
        />
      </Field>

      {template.variables.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Variables:</span>
          {template.variables.map((variable) => (
            <code
              key={variable}
              className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {`{{${variable}}}`}
            </code>
          ))}
        </div>
      ) : null}

      {save.isError ? (
        <p className="text-sm text-destructive">{normaliseError(save.error).message}</p>
      ) : null}
      {test.isError ? (
        <p className="text-sm text-destructive">{normaliseError(test.error).message}</p>
      ) : null}
      {save.isSuccess ? <p className="text-sm font-medium text-positive">Template saved.</p> : null}
      {testResult ? <p className="text-sm font-medium text-positive">{testResult}</p> : null}

      {/* Preview */}
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Preview
        </p>
        <div className="rounded-lg border border-hairline bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="flex size-7 items-center justify-center rounded-md bg-ink text-[11px] font-bold text-white">
              Q
            </span>
            <span className="font-semibold text-ink">BiZik</span>
          </div>
          <p className="mt-3 font-semibold text-ink">{fillVariables(subject)}</p>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{fillVariables(body)}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Broadcasts */

const AUDIENCE_OPTIONS: { value: BroadcastAudience; label: string }[] = [
  { value: 'ALL', label: 'All users' },
  { value: 'FREELANCERS', label: 'Freelancers' },
  { value: 'CLIENTS', label: 'Clients' },
];

const CATEGORY_OPTIONS: { value: BroadcastCategory; label: string }[] = [
  { value: 'SYSTEM', label: 'System' },
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'SECURITY', label: 'Security' },
];

function BroadcastTab() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<BroadcastAudience>('ALL');
  const [category, setCategory] = useState<BroadcastCategory>('SYSTEM');
  const [channels, setChannels] = useState<NotifyChannel[]>(['EMAIL', 'PUSH']);
  const [result, setResult] = useState<string | null>(null);

  const send = useSendBroadcast();
  const { data: history } = useBroadcasts(true);
  const { data: counts } = useAudienceCounts(true);

  const canSubmit =
    title.trim().length >= 3 && body.trim().length >= 5 && channels.length > 0 && !send.isPending;

  function toggleChannel(channel: NotifyChannel) {
    setChannels((current) =>
      current.includes(channel) ? current.filter((entry) => entry !== channel) : [...current, channel],
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setResult(null);
    send.mutate(
      { title: title.trim(), body: body.trim(), audience, category, channels },
      {
        onSuccess: (response) => {
          setResult(`Broadcast delivered to ${response.recipients} user(s).`);
          setTitle('');
          setBody('');
        },
      },
    );
  }

  function audienceLabel(option: { value: BroadcastAudience; label: string }): string {
    const count = counts?.[option.value];
    return count === undefined ? option.label : `${option.label} (${count.toLocaleString()})`;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-lg border border-hairline bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:col-span-3"
      >
        <div>
          <h2 className="text-base font-bold text-ink">Compose broadcast</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Delivers to every user in the chosen audience across the selected channels.
          </p>
        </div>

        <Field label="Audience">
          <select
            value={audience}
            onChange={(event) => setAudience(event.target.value as BroadcastAudience)}
            className="h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
          >
            {AUDIENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {audienceLabel(option)}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Channels">
            <div className="flex flex-wrap gap-2">
              {EDITABLE_CHANNELS.map((channel) => {
                const on = channels.includes(channel);
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => toggleChannel(channel)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      on
                        ? 'border-brand-400 bg-brand-50 text-brand-700'
                        : 'border-field bg-white text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {CHANNEL_LABEL[channel]}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as BroadcastCategory)}
              className="h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Subject">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="e.g. Scheduled maintenance this weekend"
            className="h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
          />
        </Field>

        <Field label="Message">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Keep it short - one message, one action."
            className="w-full resize-none rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
          />
        </Field>

        {send.isError ? (
          <p className="text-sm text-destructive">{normaliseError(send.error).message}</p>
        ) : null}
        {result ? <p className="text-sm font-medium text-positive">{result}</p> : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send broadcast
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-hairline bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:col-span-2">
        <h2 className="text-base font-bold text-ink">Broadcast history</h2>
        <div className="mt-4 space-y-3">
          {(history ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No broadcasts sent yet.</p>
          ) : (
            (history ?? []).map((broadcast) => (
              <div key={broadcast.id} className="rounded-lg border border-hairline p-3">
                <p className="text-sm font-semibold text-ink">{broadcast.title}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium capitalize">
                    {broadcast.audience.toLowerCase()}
                  </span>
                  {broadcast.channels
                    .filter((channel) => channel !== 'IN_APP')
                    .map((channel) => (
                      <ChannelChip key={channel} channel={channel} />
                    ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground/70">
                  {broadcast.recipients.toLocaleString()} recipients · {timeAgo(broadcast.createdAt)} · by{' '}
                  {broadcast.sentBy}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Moderation */

function truncate(text: string, max = 90): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function ModerationTab() {
  const [filter, setFilter] = useState<'PENDING' | 'RESOLVED'>('PENDING');
  const { data, isLoading, isError, error } = useModerationQueue(filter, true);
  const { remove, dismiss } = useModerationActions();
  const [confirm, setConfirm] = useState<{ kind: 'remove' | 'dismiss'; report: ModerationItem } | null>(
    null,
  );
  const reports = data ?? [];
  const busy = remove.isPending || dismiss.isPending;

  async function runConfirm() {
    if (!confirm) return;
    try {
      if (confirm.kind === 'remove') await remove.mutateAsync(confirm.report.id);
      else await dismiss.mutateAsync(confirm.report.id);
    } catch {
      /* toast handled in the hook */
    } finally {
      setConfirm(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-lg border border-hairline bg-surface p-1">
          <FilterPill active={filter === 'PENDING'} onClick={() => setFilter('PENDING')}>
            Pending{reports.length && filter === 'PENDING' ? ` · ${reports.length}` : ''}
          </FilterPill>
          <FilterPill active={filter === 'RESOLVED'} onClick={() => setFilter('RESOLVED')}>
            Resolved
          </FilterPill>
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Auto-flagged by the abuse classifier and user reports across in-contract chats.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="p-2 text-sm text-destructive">{normaliseError(error).message}</div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-20 text-center">
          <ShieldQuestion className="size-8 text-muted-foreground/60" />
          <p className="text-sm font-semibold text-ink">
            {filter === 'PENDING' ? 'Queue is clear' : 'Nothing resolved yet'}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {filter === 'PENDING'
              ? 'No reported in-contract messages are awaiting review.'
              : 'Resolved reports (removed or dismissed) will appear here.'}
          </p>
        </div>
      ) : (
        reports.map((report) => (
          <ModerationCard
            key={report.id}
            report={report}
            onRemove={() => setConfirm({ kind: 'remove', report })}
            onDismiss={() => setConfirm({ kind: 'dismiss', report })}
            busy={busy}
          />
        ))
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm?.kind === 'remove' ? 'Remove this message?' : 'Dismiss this report?'}
        description={
          confirm?.kind === 'remove'
            ? 'The message is hidden from both parties and the sender is notified.'
            : 'Close the report with no action - the message stays visible to both parties.'
        }
        confirmLabel={confirm?.kind === 'remove' ? 'Yes, remove message' : 'Yes, dismiss report'}
        tone={confirm?.kind === 'remove' ? 'danger' : 'default'}
        icon={confirm?.kind === 'remove' ? Trash2 : ShieldCheck}
        subject={
          confirm
            ? { label: 'Message', value: `“${truncate(confirm.report.messageBody)}”` }
            : undefined
        }
        consequences={
          confirm?.kind === 'remove'
            ? [
                'The message body is replaced with a removal notice',
                'The sender gets an in-app warning about our guidelines',
                'Recorded in the audit log with your operator ID',
              ]
            : [
                'The report is marked dismissed (no action taken)',
                'The message stays visible to both parties',
              ]
        }
        onConfirm={runConfirm}
      />
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/** A party's name, linking to their user profile when we know their id. */
function PartyLink({ id, name }: { id: string | null; name: string }) {
  if (!id) return <span className="font-semibold text-ink">{name}</span>;
  return (
    <Link
      href={`/users/${id}`}
      className="inline-flex items-center gap-1 font-semibold text-ink hover:text-brand-700 hover:underline"
    >
      <UserIcon className="size-3.5 text-muted-foreground" />
      {name}
    </Link>
  );
}

function ModerationCard({
  report,
  onRemove,
  onDismiss,
  busy,
}: {
  report: ModerationItem;
  onRemove: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const [showThread, setShowThread] = useState(false);
  const isPending = report.status === 'PENDING';
  const outcomeRemoved = report.status === 'REMOVED';

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase',
            report.source === 'CLASSIFIER'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-rose-100 text-rose-800',
          )}
        >
          {report.source === 'CLASSIFIER' ? 'Auto-flagged' : 'Reported'}
        </span>
        <span className="flex items-center gap-1.5">
          <PartyLink id={report.senderId} name={report.senderName} />
          <span className="text-muted-foreground">→</span>
          <PartyLink id={report.recipientId} name={report.recipientName} />
        </span>
        <span className="text-xs text-muted-foreground">
          {report.contractId ? (
            <Link
              href={`/contracts/${report.contractId}`}
              className="font-mono hover:text-brand-700 hover:underline"
            >
              {report.contractId}
            </Link>
          ) : null}
          {report.contractId ? ' · ' : ''}
          {report.contractTitle} · {timeAgo(report.createdAt)}
        </span>
      </div>

      <p className="mt-3 text-sm text-ink">{report.reason}</p>
      <blockquote
        className={cn(
          'mt-2 border-l-2 pl-3 text-sm italic',
          report.messageRemoved
            ? 'border-hairline text-muted-foreground/70'
            : 'border-rose-200 text-muted-foreground',
        )}
      >
        {report.messageRemoved ? 'Message removed' : `“${report.messageBody}”`}
      </blockquote>

      <button
        type="button"
        onClick={() => setShowThread((value) => !value)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:opacity-80"
      >
        <MessagesSquare className="size-3.5" />
        {showThread ? 'Hide conversation' : 'View conversation'}
        <ChevronDown className={cn('size-3.5 transition-transform', showThread && 'rotate-180')} />
      </button>
      {showThread ? <ConversationThread reportId={report.id} /> : null}

      {isPending ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="size-4" /> Remove message
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-field px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted disabled:opacity-50"
          >
            Dismiss report
          </button>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-3 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold',
              outcomeRemoved ? 'bg-rose-100 text-rose-800' : 'bg-muted text-muted-foreground',
            )}
          >
            {outcomeRemoved ? <Trash2 className="size-3" /> : <ShieldCheck className="size-3" />}
            {outcomeRemoved ? 'Message removed' : 'Report dismissed'}
          </span>
          <span className="text-muted-foreground">
            by {report.resolvedByName ?? 'a moderator'}
            {report.resolvedAt ? ` · ${timeAgo(report.resolvedAt)}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

/** The reported message's full conversation, so the moderator has context. */
function ConversationThread({ reportId }: { reportId: string }) {
  const { data, isLoading, isError, error } = useModerationThread(reportId);
  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-hairline bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading conversation…
      </div>
    );
  }
  if (isError) {
    return <div className="mt-3 text-xs text-destructive">{normaliseError(error).message}</div>;
  }
  const messages = data?.messages ?? [];
  return (
    <div className="mt-3 space-y-1.5 rounded-lg border border-hairline bg-muted/30 p-3">
      {messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No other messages in this conversation.</p>
      ) : (
        messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'rounded-md px-2.5 py-1.5',
              message.isReported ? 'bg-rose-50 ring-1 ring-rose-200' : '',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-ink">{message.senderName}</span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(message.createdAt)}</span>
            </div>
            <p
              className={cn(
                'text-[13px]',
                message.removed ? 'text-muted-foreground/70 italic' : 'text-ink',
              )}
            >
              {message.body}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- shared */

function amlCount(byType?: Record<string, number>): number | undefined {
  if (!byType) return undefined;
  return (byType.AML_ALERT ?? 0) + (byType.SANCTIONS_MATCH ?? 0) + (byType.ACCOUNT_FROZEN ?? 0);
}

function disputeCount(byType?: Record<string, number>): number | undefined {
  if (!byType) return undefined;
  return (byType.DISPUTE_FILED ?? 0) + (byType.DISPUTE_ESCALATED ?? 0);
}

function ChannelChip({ channel }: { channel: string }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {CHANNEL_LABEL[channel] ?? channel}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active ? 'border-primary text-ink' : 'border-transparent text-muted-foreground hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}

function StatCard({
  label,
  value,
  note,
  tone = 'muted',
}: {
  label: string;
  value?: number;
  note?: string;
  tone?: 'positive' | 'warning' | 'negative' | 'muted';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'negative'
          ? 'text-negative'
          : 'text-muted-foreground';
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink">{value ?? '-'}</p>
      {note ? <p className={cn('mt-1 text-xs font-medium', toneClass)}>{note}</p> : null}
    </div>
  );
}
