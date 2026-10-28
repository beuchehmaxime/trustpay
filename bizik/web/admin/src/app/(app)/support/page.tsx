'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BookOpen,
  Check,
  Loader2,
  Lock,
  LifeBuoy,
  Plus,
  Search,
  Send,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { avatarColor, initials } from '@/lib/avatar';
import {
  useHelpActions,
  useHelpArticles,
  useSupportStats,
  useTicket,
  useTicketActions,
  useTickets,
} from '@/features/support/hooks';
import type {
  HelpArticle,
  TicketDetail,
  TicketPriority,
  TicketStatus,
} from '@/features/support/types';

type TabKey = 'tickets' | 'help';

export default function SupportPage() {
  const canView = usePermission('support.view');
  const canManage = usePermission('support.manage');
  const [tab, setTab] = useState<TabKey>('tickets');

  if (!canView) return <NoAccess />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase">
          <span className="text-muted-foreground">Access &amp; settings</span>{' '}
          <span className="text-ink">Support</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tickets from users and help-center content management.
        </p>
      </div>

      <div className="flex gap-1 border-b border-hairline">
        <TabButton active={tab === 'tickets'} onClick={() => setTab('tickets')} icon={<LifeBuoy className="size-4" />}>
          Tickets
        </TabButton>
        <TabButton active={tab === 'help'} onClick={() => setTab('help')} icon={<BookOpen className="size-4" />}>
          Help center
        </TabButton>
      </div>

      {tab === 'tickets' ? (
        <Suspense fallback={<Spinner />}>
          <TicketsTab canManage={canManage} />
        </Suspense>
      ) : (
        <HelpTab canManage={canManage} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Tickets */

const STATUS_FILTERS: { value: TicketStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_TONE: Record<TicketStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-800',
  PENDING: 'bg-blue-100 text-blue-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-slate-100 text-slate-600',
};

const PRIORITY_TONE: Record<TicketPriority, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  NORMAL: 'bg-blue-50 text-blue-700',
  HIGH: 'bg-rose-100 text-rose-700',
  URGENT: 'bg-rose-600 text-white',
};

function TicketsTab({ canManage }: { canManage: boolean }) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('ticket'));

  const { data: stats } = useSupportStats();
  const { data, isLoading } = useTickets({ status: status || undefined, search: search || undefined });
  const tickets = data ?? [];

  // Derive the active ticket (no effect): the explicit selection, else the first.
  const effectiveId = selectedId ?? tickets[0]?.id ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Open" value={stats?.open} tone="warning" />
        <StatCard label="Pending" value={stats?.pending} tone="info" />
        <StatCard label="Resolved" value={stats?.resolved} tone="positive" />
        <StatCard label="Unresolved" value={stats?.unresolved} tone="muted" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* List */}
        <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex gap-2 border-b border-hairline p-3">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tickets…"
                className="h-9 w-full rounded-lg border border-field bg-white pr-3 pl-9 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
              />
            </div>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as TicketStatus | '')}
              className="h-9 rounded-lg border border-field bg-white px-2 text-sm text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-[32rem] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : tickets.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">No tickets found.</p>
            ) : (
              <ul>
                {tickets.map((ticket) => {
                  const active = ticket.id === effectiveId;
                  return (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(ticket.id)}
                        className={cn(
                          'flex w-full flex-col gap-1 border-b border-hairline px-4 py-3 text-left transition-colors last:border-b-0',
                          active ? 'bg-brand-50/60' : 'hover:bg-muted/40',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ink">{ticket.subject}</span>
                          <span
                            className={cn(
                              'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                              STATUS_TONE[ticket.status],
                            )}
                          >
                            {ticket.statusLabel}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">
                            {ticket.requesterName}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground/70">
                            {relTime(ticket.lastMessageAt)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Conversation */}
        {effectiveId ? (
          <TicketPanel key={effectiveId} ticketId={effectiveId} canManage={canManage} />
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed py-24 text-sm text-muted-foreground">
            Select a ticket to view the conversation.
          </div>
        )}
      </div>
    </div>
  );
}

const PRIORITY_OPTIONS: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const STATUS_ACTIONS: TicketStatus[] = ['OPEN', 'PENDING', 'RESOLVED'];

function TicketPanel({ ticketId, canManage }: { ticketId: string; canManage: boolean }) {
  const { data: ticket, isLoading } = useTicket(ticketId);
  const { reply, setStatus, setPriority } = useTicketActions();
  const [text, setText] = useState('');

  if (isLoading || !ticket) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-hairline bg-surface py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function onReply() {
    if (text.trim().length === 0) return;
    reply.mutate({ id: ticket!.id, body: text.trim() }, { onSuccess: () => setText('') });
  }

  return (
    <div className="flex min-h-[34rem] flex-col overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-hairline p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-bold text-ink">{ticket.subject}</h2>
            <PriorityControl ticket={ticket} canManage={canManage} onChange={setPriority} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {ticket.requesterName} · {ticket.categoryLabel} · updated {relTime(ticket.lastMessageAt)}
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-field p-0.5">
          {STATUS_ACTIONS.map((option) => {
            const active = ticket.status === option;
            return (
              <button
                key={option}
                type="button"
                disabled={!canManage || setStatus.isPending}
                onClick={() => setStatus.mutate({ id: ticket.id, status: option })}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors disabled:cursor-not-allowed',
                  active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-ink',
                  !canManage && !active && 'opacity-50',
                )}
              >
                {option.toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {ticket.messages.map((message) => {
          const staff = message.authorType === 'STAFF';
          return (
            <div key={message.id} className={cn('flex gap-3', staff && 'flex-row-reverse')}>
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  staff ? 'bg-primary text-primary-foreground' : avatarColor(message.senderName),
                )}
              >
                {initials(message.senderName)}
              </span>
              <div className={cn('min-w-0 max-w-[80%]', staff && 'text-right')}>
                <div className={cn('flex items-center gap-2', staff && 'flex-row-reverse')}>
                  <span className="text-xs font-semibold text-ink">{message.senderName}</span>
                  {staff ? (
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 uppercase">
                      Staff
                    </span>
                  ) : null}
                  <span className="text-[11px] text-muted-foreground/70">{fullTime(message.createdAt)}</span>
                </div>
                <div
                  className={cn(
                    'mt-1 inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm',
                    staff ? 'bg-primary/10 text-ink' : 'bg-muted text-ink',
                  )}
                >
                  <p className="whitespace-pre-line">{message.body}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      {canManage ? (
        ticket.status === 'CLOSED' ? (
          <p className="border-t border-hairline p-4 text-center text-sm text-muted-foreground">
            This ticket is closed.
          </p>
        ) : (
          <div className="border-t border-hairline p-3">
            {reply.isError ? (
              <p className="mb-2 text-sm text-destructive">{normaliseError(reply.error).message}</p>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onReply();
                }}
                rows={2}
                placeholder="Write a reply - the user is notified by email…"
                className="flex-1 resize-none rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
              />
              <button
                type="button"
                onClick={onReply}
                disabled={text.trim().length === 0 || reply.isPending}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {reply.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Reply
              </button>
            </div>
          </div>
        )
      ) : (
        <p className="border-t border-hairline p-4 text-center text-xs text-muted-foreground">
          You have view-only access - replying requires the “Respond to support tickets” permission.
        </p>
      )}
    </div>
  );
}

function PriorityControl({
  ticket,
  canManage,
  onChange,
}: {
  ticket: TicketDetail;
  canManage: boolean;
  onChange: ReturnType<typeof useTicketActions>['setPriority'];
}) {
  if (!canManage) {
    return (
      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold uppercase', PRIORITY_TONE[ticket.priority])}>
        {ticket.priority}
      </span>
    );
  }
  return (
    <select
      value={ticket.priority}
      onChange={(event) => onChange.mutate({ id: ticket.id, priority: event.target.value as TicketPriority })}
      className={cn(
        'rounded-full border-0 px-2 py-0.5 text-[11px] font-bold uppercase outline-none',
        PRIORITY_TONE[ticket.priority],
      )}
    >
      {PRIORITY_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------ Help center */

function HelpTab({ canManage }: { canManage: boolean }) {
  const { data: articles, isLoading } = useHelpArticles(true);
  const [editing, setEditing] = useState<HelpArticle | 'new' | null>(null);

  if (isLoading) return <Spinner />;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-2 lg:col-span-2">
        {canManage ? (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-300 px-3 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50"
          >
            <Plus className="size-4" /> New article
          </button>
        ) : null}
        {(articles ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No help articles yet.</p>
        ) : (
          (articles ?? []).map((article) => {
            const active = editing !== 'new' && editing?.id === article.id;
            return (
              <button
                key={article.id}
                type="button"
                onClick={() => setEditing(article)}
                className={cn(
                  'flex w-full items-start justify-between gap-3 rounded-lg border p-4 text-left transition-colors',
                  active
                    ? 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-400'
                    : 'border-hairline bg-surface hover:bg-muted/40',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{article.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{article.category}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    article.published ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {article.published ? 'Published' : 'Draft'}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="lg:col-span-3">
        {editing ? (
          <HelpEditor
            key={editing === 'new' ? 'new' : editing.id}
            article={editing === 'new' ? null : editing}
            canManage={canManage}
            onDone={() => setEditing(null)}
          />
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed py-24 text-sm text-muted-foreground">
            Select an article to view or edit.
          </div>
        )}
      </div>
    </div>
  );
}

function HelpEditor({
  article,
  canManage,
  onDone,
}: {
  article: HelpArticle | null;
  canManage: boolean;
  onDone: () => void;
}) {
  const { create, update, remove } = useHelpActions();
  const [category, setCategory] = useState(article?.category ?? 'Getting started');
  const [title, setTitle] = useState(article?.title ?? '');
  const [body, setBody] = useState(article?.body ?? '');
  const [published, setPublished] = useState(article?.published ?? false);

  const readOnly = !canManage;
  const canSave = title.trim().length > 0 && body.trim().length > 0;

  function onSave() {
    const input = { category, title, body, published, order: article?.order ?? 0 };
    if (article) update.mutate({ id: article.id, input });
    else create.mutate(input, { onSuccess: () => onDone() });
  }

  const pending = create.isPending || update.isPending;
  const error = create.isError
    ? normaliseError(create.error).message
    : update.isError
      ? normaliseError(update.error).message
      : null;

  return (
    <div className="space-y-4 rounded-lg border border-hairline bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">{article ? 'Edit article' : 'New article'}</h2>
        {article && canManage ? (
          <button
            type="button"
            onClick={() => remove.mutate(article.id, { onSuccess: () => onDone() })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="size-4" /> Delete
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={readOnly}
            className="h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:bg-muted/50"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Category</span>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            disabled={readOnly}
            className="h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:bg-muted/50"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Body</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={readOnly}
          rows={10}
          className="w-full resize-y rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:bg-muted/50"
        />
      </label>

      {canManage ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-hairline px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">Published</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Visible to users in the app help center.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={published}
            onClick={() => setPublished((value) => !value)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
              published ? 'bg-brand-600' : 'bg-slate-300',
            )}
          >
            <span
              className={cn(
                'inline-block size-4 rounded-full bg-white shadow transition-transform',
                published ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {(create.isSuccess || update.isSuccess) && !error ? (
        <p className="text-sm font-medium text-positive">Saved.</p>
      ) : null}

      {canManage ? (
        <div className="flex justify-end gap-2 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={onDone}
            className="inline-flex items-center gap-1.5 rounded-lg border border-field px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave || pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {article ? 'Save changes' : 'Create article'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ primitives */

function relTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Today, ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fullTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <Lock className="size-6" />
      </span>
      <p className="text-sm font-semibold text-ink">No access</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        You don’t have permission to view support tickets.
      </p>
    </div>
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

function StatCard({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value?: number;
  tone?: 'positive' | 'warning' | 'info' | 'muted';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'info'
          ? 'text-blue-600'
          : 'text-muted-foreground';
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold', toneClass)}>{value ?? '-'}</p>
    </div>
  );
}
