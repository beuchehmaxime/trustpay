'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Lock, MessageCircle, Search, ShieldCheck, UserRound, X } from 'lucide-react';

import { normaliseError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useWhatsAppConversations, useWhatsAppThread } from './hooks';
import type { WhatsAppConversation, WhatsAppConversationFilter } from './types';

/**
 * The channel as an inbox: contacts on the left, one thread on the right.
 *
 * The page used to list the newest messages from everyone interleaved, which
 * stops being readable the moment two people are talking - an operator had to
 * reconstruct who said what from timestamps. Here a conversation is the unit,
 * so a busy channel makes the list longer, not the page noisier.
 */

const FILTERS: { key: WhatsAppConversationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'linked', label: 'With an account' },
  { key: 'guests', label: 'Guests' },
  { key: 'reachable', label: 'Replyable now' },
  { key: 'locked', label: 'Locked' },
  { key: 'optedOut', label: 'Opted out' },
];

const PAGE_SIZE = 25;

/** "2h ago" / "3d ago" - a conversation list reads better in relative time. */
function since(value: string | null): string {
  if (!value) return '-';
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.round(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function dayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return 'Today';
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ConversationInbox() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<WhatsAppConversationFilter>('all');
  const [page, setPage] = useState(0);
  // What the operator clicked. The conversation actually OPEN is derived from it
  // below, because the list reloads (search, filter, page, refetch) and a stored
  // id can stop being in it - resolving that during render rather than in an
  // effect avoids a second render pass and an empty flash.
  const [clickedId, setClickedId] = useState<string | null>(null);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const list = useWhatsAppConversations({
    search: debouncedSearch || undefined,
    filter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const conversations = useMemo(() => list.data?.conversations ?? [], [list.data]);
  const total = list.data?.total ?? 0;

  // Keep a selection that is still in the list; otherwise open the newest.
  const selectedId =
    clickedId && conversations.some((entry) => entry.id === clickedId)
      ? clickedId
      : (conversations[0]?.id ?? null);

  const thread = useWhatsAppThread(selectedId);

  return (
    <section className="shadow-card overflow-hidden rounded-2xl border border-hairline bg-surface">
      <div className="border-b border-hairline px-5 py-4">
        <h2 className="text-sm font-bold text-ink">Conversations</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          One thread per contact. Numbers are masked, and PINs are never recorded.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search a name, @handle or last digits"
              className="h-9 w-full rounded-lg border border-field bg-white pl-9 pr-8 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-ink"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => {
                  setFilter(entry.key);
                  setPage(0);
                }}
                className={cn(
                  'h-8 rounded-lg px-3 text-xs font-semibold transition',
                  filter === entry.key
                    ? 'bg-brand-600 text-white'
                    : 'border border-hairline text-muted-foreground hover:text-ink',
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* ── Contacts ── */}
        <div className="max-h-[560px] overflow-y-auto border-hairline lg:border-r">
          {list.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : list.isError ? (
            <p className="px-5 py-12 text-center text-xs text-muted-foreground">
              {normaliseError(list.error).message}
            </p>
          ) : conversations.length === 0 ? (
            <p className="px-5 py-12 text-center text-xs text-muted-foreground">
              {debouncedSearch || filter !== 'all'
                ? 'No conversation matches that.'
                : 'No one has messaged the assistant yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => setClickedId(conversation.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition hover:bg-muted/40',
                      selectedId === conversation.id && 'bg-brand-50/70',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-ink">
                        {conversation.user?.name ?? conversation.phone}
                      </span>
                      <span className="shrink-0 text-[10.5px] text-subtle">
                        {since(conversation.lastMessage?.createdAt ?? null)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      {conversation.lastMessage?.direction === 'OUTBOUND' ? 'Assistant: ' : ''}
                      {conversation.lastMessage?.preview ?? 'No messages'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <Tag>{conversation.messages.total} msgs</Tag>
                      {conversation.user ? (
                        <Tag tone="brand">{conversation.phone}</Tag>
                      ) : (
                        <Tag tone="muted">Guest</Tag>
                      )}
                      {conversation.locked ? <Tag tone="danger">Locked</Tag> : null}
                      {!conversation.optIn ? <Tag tone="warn">Opted out</Tag> : null}
                      {conversation.reachable ? <Tag tone="positive">Replyable</Tag> : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {total > PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-2 border-t border-hairline px-4 py-2.5 text-xs">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                className="rounded-md px-2 py-1 font-semibold text-muted-foreground disabled:opacity-40 hover:text-ink"
              >
                Previous
              </button>
              <span className="text-subtle">
                {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <button
                type="button"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-md px-2 py-1 font-semibold text-muted-foreground disabled:opacity-40 hover:text-ink"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>

        {/* ── Thread ── */}
        <div className="flex min-h-[420px] flex-col">
          {!selectedId ? (
            <EmptyThread />
          ) : thread.isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : thread.isError || !thread.data?.conversation ? (
            <p className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
              Could not load this conversation.
            </p>
          ) : (
            <Thread conversation={thread.data.conversation} messages={thread.data.messages} hasMore={thread.data.hasMore} />
          )}
        </div>
      </div>
    </section>
  );
}

function Thread({
  conversation,
  messages,
  hasMore,
}: {
  conversation: WhatsAppConversation;
  messages: { id: string; direction: 'INBOUND' | 'OUTBOUND'; kind: string; body: string | null; createdAt: string }[];
  hasMore: boolean;
}) {
  // Which messages start a new day, worked out up front. Tracking it with a
  // mutable variable while mapping mutates during render, which React 19 flags
  // and which misbehaves if the list is rendered twice.
  const dayHeadings = messages.map((message, index) => {
    const day = dayLabel(message.createdAt);
    const previous = index > 0 ? dayLabel(messages[index - 1].createdAt) : null;
    return day === previous ? null : day;
  });

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">
            {conversation.user?.name ?? conversation.phone}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
            <span>{conversation.phone}</span>
            {conversation.user?.username ? <span>@{conversation.user.username}</span> : null}
            <span>
              {conversation.messages.inbound} in / {conversation.messages.outbound} out
            </span>
            {conversation.firstMessageAt ? (
              <span>since {new Date(conversation.firstMessageAt).toLocaleDateString()}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {conversation.hasPin ? (
            <Tag tone="positive">
              <ShieldCheck className="mr-1 inline size-3" />
              PIN set
            </Tag>
          ) : null}
          {conversation.locked ? (
            <Tag tone="danger">
              <Lock className="mr-1 inline size-3" />
              Locked
            </Tag>
          ) : null}
          {conversation.user ? (
            <Link
              href={`/users/${conversation.user.id}`}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-3 text-xs font-semibold text-muted-foreground transition hover:text-ink"
            >
              <UserRound className="size-3.5" />
              Open account
            </Link>
          ) : null}
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4" style={{ maxHeight: 460 }}>
        {hasMore ? (
          <p className="pb-2 text-center text-[11px] text-subtle">
            Showing the most recent messages of a longer conversation.
          </p>
        ) : null}
        {messages.map((message, index) => {
          const day = dayHeadings[index];
          const inbound = message.direction === 'INBOUND';
          return (
            <div key={message.id}>
              {day ? (
                <p className="py-2 text-center text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
                  {day}
                </p>
              ) : null}
              <div className={cn('flex', inbound ? 'justify-start' : 'justify-end')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words',
                    inbound ? 'bg-muted text-ink' : 'bg-brand-600 text-white',
                  )}
                >
                  {message.body ?? <span className="italic opacity-70">({message.kind})</span>}
                  <span
                    className={cn(
                      'mt-1 block text-[10px]',
                      inbound ? 'text-muted-foreground' : 'text-white/70',
                    )}
                  >
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function EmptyThread() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
      <MessageCircle className="size-6" />
      <p className="text-xs">Pick a conversation to read it.</p>
    </div>
  );
}

function Tag({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'brand' | 'muted' | 'danger' | 'warn' | 'positive';
}) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-bold',
        tone === 'brand' && 'bg-brand-50 text-brand-700',
        tone === 'danger' && 'bg-negative-bg text-negative',
        tone === 'warn' && 'bg-amber-50 text-amber-800',
        tone === 'positive' && 'bg-positive-bg text-positive-text',
        (tone === 'default' || tone === 'muted') && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}
