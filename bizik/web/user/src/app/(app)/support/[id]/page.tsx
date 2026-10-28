'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';

import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { useReplyTicket, useTicket } from '@/lib/hooks/use-support';
import type { TicketMessage, TicketStatus } from '@/lib/api/support.api';
import { normaliseError } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<TicketStatus, StatusTone> = {
  OPEN: 'brand',
  PENDING: 'warning',
  RESOLVED: 'positive',
  CLOSED: 'neutral',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO -> "1 Aug · 10:12". */
function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date.getDate()} ${MONTHS[date.getMonth()]} · ${time}`;
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { data: ticket, isLoading, isError } = useTicket(params.id);
  const replyTicket = useReplyTicket();

  const [draft, setDraft] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="size-6 animate-spin rounded-full border-2 border-brand-100 border-t-brand-500" />
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-bold text-ink">{t('support.notFound')}</p>
        <Link href="/support" className="mt-2 text-[13px] font-semibold text-brand-700 hover:underline">
          ← {t('support.title')}
        </Link>
      </div>
    );
  }

  const resolved = ticket.status === 'RESOLVED';

  const submitReply = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || replyTicket.isPending) return;
    replyTicket.mutate(
      { id: ticket.id, body },
      {
        onSuccess: () => setDraft(''),
        onError: (error) => toast.error(normaliseError(error).message || t('support.actionError')),
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4 md:max-w-none">
      {/* Back (mobile - no top bar) */}
      <Link
        href="/support"
        className="flex w-fit items-center gap-1.5 text-[14px] font-semibold text-brand-700 md:hidden"
      >
        <ArrowLeft className="size-4" />
        {t('support.title')}
      </Link>

      {/* Header */}
      <div className="-mx-4 -mt-4 border-b border-hairline bg-surface px-4 pb-4 pt-5 md:mx-0 md:mt-0 md:rounded-2xl md:border md:px-6 md:pt-6">
        <div className="flex items-center gap-2.5">
          <StatusPill tone={STATUS_TONE[ticket.status]}>{ticket.statusLabel}</StatusPill>
          <span className="text-[12.5px] font-semibold text-muted-foreground">{ticket.categoryLabel}</span>
        </div>
        <h1 className="mt-2 text-xl font-extrabold text-ink">{ticket.subject}</h1>
      </div>

      {/* Thread + composer */}
      <section className="shadow-card flex flex-col rounded-2xl border border-hairline bg-surface p-5 md:p-6">
        <div className="space-y-3">
          {ticket.messages.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t('support.noMessages')}</p>
          ) : null}

          {ticket.messages.map((message: TicketMessage) => {
            const authorLabel =
              message.authorType === 'STAFF' ? t('support.supportLabel') : message.senderName;
            return (
              <div
                key={message.id}
                className={cn('flex flex-col', message.mine ? 'items-end' : 'items-start')}
              >
                <span className="mb-1 px-1 text-[11px] font-semibold text-subtle">
                  {message.mine ? t('support.you') : authorLabel} · {formatMessageTime(message.createdAt)}
                </span>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed',
                    message.mine ? 'bg-brand-500 text-white' : 'bg-muted text-ink',
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {resolved ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-positive-text/20 bg-positive-bg p-3">
            <CheckCircle2 className="size-4 shrink-0 text-positive-text" />
            <p className="text-[12.5px] font-medium text-positive-text">{t('support.resolvedHint')}</p>
          </div>
        ) : null}

        {/* Composer */}
        {ticket.canReply ? (
          <form
            onSubmit={submitReply}
            className="mt-5 flex items-center gap-2 rounded-2xl border border-hairline bg-surface p-2 pl-4 focus-within:border-brand-border"
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('support.replyPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-subtle"
            />
            <button
              type="submit"
              disabled={replyTicket.isPending || draft.trim().length === 0}
              aria-label={t('support.send')}
              className="bg-primary shadow-brand flex size-9 items-center justify-center rounded-lg text-white transition hover:opacity-95 disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </form>
        ) : (
          <p className="mt-5 rounded-2xl bg-muted/50 px-4 py-3 text-center text-[12.5px] text-muted-foreground">
            {t('support.replyClosed')}
          </p>
        )}
      </section>
    </div>
  );
}
