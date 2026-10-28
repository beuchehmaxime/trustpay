'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Lock,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { useHelpArticles, useTickets } from '@/lib/hooks/use-support';
import type { HelpArticle, TicketListItem, TicketStatus } from '@/lib/api/support.api';

/** Leading icons cycle across the help-article rows. */
const ARTICLE_ICONS: LucideIcon[] = [Lock, ShieldCheck, ArrowLeftRight, MessageSquare];

/** Ticket status → StatusPill tone. */
const STATUS_TONE: Record<TicketStatus, StatusTone> = {
  OPEN: 'brand',
  PENDING: 'warning',
  RESOLVED: 'positive',
  CLOSED: 'neutral',
};

/** ISO timestamp → short relative label (e.g. "3d", "5h", "now"). */
function relativeTime(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(elapsed)) return '';
  const days = Math.floor(elapsed / 86_400_000);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.floor(elapsed / 60_000);
  return minutes >= 1 ? `${minutes}m` : 'now';
}

export default function SupportPage() {
  const { t } = useTranslation();
  const { data: articles, isLoading: articlesLoading } = useHelpArticles();
  const { data: tickets, isLoading: ticketsLoading } = useTickets();

  const [query, setQuery] = useState('');
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);

  const helpArticles = useMemo<HelpArticle[]>(() => articles ?? [], [articles]);

  // Local title/body search over the fetched articles.
  const filteredArticles = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return helpArticles;
    return helpArticles.filter(
      (article) =>
        article.title.toLowerCase().includes(term) || article.body.toLowerCase().includes(term),
    );
  }, [helpArticles, query]);

  // Group the (filtered) articles by category, preserving first-seen order.
  const groupedArticles = useMemo(() => {
    const groups = new Map<string, HelpArticle[]>();
    filteredArticles.forEach((article) => {
      const bucket = groups.get(article.category);
      if (bucket) bucket.push(article);
      else groups.set(article.category, [article]);
    });
    return Array.from(groups.entries());
  }, [filteredArticles]);

  const ticketList = tickets ?? [];

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4 md:max-w-none">
      {/* Full-width header band */}
      <div className="-mx-4 -mt-4 border-b border-hairline bg-surface px-4 pb-4 pt-5 md:mx-0 md:mt-0 md:rounded-2xl md:border md:px-6 md:pt-6">
        <h1 className="text-xl font-extrabold text-ink">{t('support.title')}</h1>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-12 w-full rounded-xl border border-hairline bg-[#F5F8FC] pl-10 pr-3.5 text-[14px] text-ink outline-none transition placeholder:text-subtle focus:border-brand-border focus:bg-surface"
            placeholder={t('support.searchPlaceholder')}
          />
        </div>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        {/* Popular articles */}
        <section>
          <h2 className="mb-2 px-1 text-[13px] font-bold text-ink">{t('support.popularArticles')}</h2>

          {articlesLoading ? (
            <div className="flex items-center justify-center rounded-2xl border border-hairline bg-surface py-12">
              <span className="size-5 animate-spin rounded-full border-2 border-brand-100 border-t-brand-500" />
            </div>
          ) : groupedArticles.length === 0 ? (
            <div className="rounded-2xl border border-hairline bg-surface px-4 py-10 text-center text-[13px] text-muted-foreground">
              {query.trim() ? t('support.noArticleMatches') : t('support.noArticles')}
            </div>
          ) : (
            <div className="space-y-4">
              {groupedArticles.map(([category, categoryArticles]) => (
                <div key={category}>
                  <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-subtle">
                    {category}
                  </p>
                  <div className="shadow-card divide-y divide-[#F1F5FA] overflow-hidden rounded-2xl border border-hairline bg-surface">
                    {categoryArticles.map((article, articleIndex) => {
                      const ArticleIcon = ARTICLE_ICONS[articleIndex % ARTICLE_ICONS.length];
                      const expanded = openArticleId === article.id;
                      return (
                        <div key={article.id}>
                          <button
                            type="button"
                            onClick={() => setOpenArticleId(expanded ? null : article.id)}
                            aria-expanded={expanded}
                            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted/40"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                              <ArticleIcon className="size-[18px]" />
                            </span>
                            <span className="flex-1 text-[14px] font-bold text-ink">{article.title}</span>
                            {expanded ? (
                              <ChevronDown className="size-4 shrink-0 text-subtle" />
                            ) : (
                              <ChevronRight className="size-4 shrink-0 text-subtle" />
                            )}
                          </button>
                          {expanded ? (
                            <p className="px-4 pb-4 pl-16 text-[13px] leading-relaxed text-muted-foreground">
                              {article.body}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* My tickets */}
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[13px] font-bold text-ink">{t('support.myTickets')}</h2>
            <Link
              href="/support/new"
              className="flex items-center gap-1 text-[12.5px] font-bold text-brand-600 transition hover:text-brand-700"
            >
              <Plus className="size-3.5" />
              {t('support.newTicket')}
            </Link>
          </div>

          {ticketsLoading ? (
            <div className="flex items-center justify-center rounded-2xl border border-hairline bg-surface py-12">
              <span className="size-5 animate-spin rounded-full border-2 border-brand-100 border-t-brand-500" />
            </div>
          ) : ticketList.length === 0 ? (
            <div className="shadow-card flex flex-col items-center rounded-2xl border border-hairline bg-surface px-6 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <MessageSquare className="size-6" />
              </span>
              <p className="mt-3 text-[14px] font-bold text-ink">{t('support.empty')}</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">{t('support.emptySub')}</p>
              <Link
                href="/support/new"
                className="bg-primary shadow-brand mt-4 flex h-11 items-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold text-white transition hover:opacity-95"
              >
                <Plus className="size-4" />
                {t('support.newRequest')}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {ticketList.map((ticket: TicketListItem) => (
                <Link
                  key={ticket.id}
                  href={`/support/${ticket.id}`}
                  className="shadow-card block w-full rounded-2xl border border-hairline bg-surface p-4 text-left transition hover:border-brand-border"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusPill tone={STATUS_TONE[ticket.status]}>{ticket.statusLabel}</StatusPill>
                    <span className="text-[11.5px] font-semibold text-subtle">
                      {ticket.categoryLabel} · {relativeTime(ticket.lastMessageAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-[14.5px] font-bold text-ink">{ticket.subject}</p>
                  {ticket.lastFromStaff ? (
                    <p className="mt-1 flex items-center gap-1 text-[11.5px] font-semibold text-brand-600">
                      <MessageSquare className="size-3" />
                      {t('support.replyFromSupport')}
                    </p>
                  ) : null}
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{ticket.preview}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
