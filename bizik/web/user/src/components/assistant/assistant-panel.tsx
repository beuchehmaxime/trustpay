'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  assistantApi,
  type AssistantMessage,
  type AssistantProposal,
} from '@/lib/api/assistant.api';
import { normaliseError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { ProposalCard } from './proposal-card';

/**
 * The assistant panel.
 *
 * A chat surface over the same agent and the same tools the WhatsApp channel
 * uses. The difference that matters is here on screen: a money action arrives
 * as a card with an Approve button and a PIN field, not as a sentence asking
 * the user to type YES. Nothing in this component can execute anything - the
 * only call that moves money is `confirm`, and the server will not run it
 * without the PIN.
 */

/** Suggestions for an empty thread. Deliberately not money actions. */
const OPENERS = ['assistant.openerBalance', 'assistant.openerDeals', 'assistant.openerHow'] as const;

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [proposal, setProposal] = useState<AssistantProposal | undefined>();
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reopening should land where the conversation was left, not on a blank
  // panel: a half-finished deal is exactly what someone comes back to.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    assistantApi
      .history()
      .then((thread) => {
        if (cancelled) return;
        setMessages(thread.messages);
        setProposal(thread.proposal);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, loading]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, proposal, sending]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;

      // Shown immediately. The round trip includes a reasoning model and can
      // take seconds; a composer that just empties looks broken.
      setMessages((prior) => [...prior, { role: 'user', content: message, at: Date.now() }]);
      setDraft('');
      setProposal(undefined);
      setSending(true);
      try {
        const result = await assistantApi.chat(message);
        setMessages((prior) => [
          ...prior,
          { role: 'assistant', content: result.reply, at: Date.now() },
        ]);
        setProposal(result.proposal);
      } catch (error) {
        const failure = normaliseError(error);
        setMessages((prior) => [
          ...prior,
          { role: 'assistant', content: failure.message, at: Date.now() },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  const approve = useCallback(
    async (pin?: string) => {
      if (!proposal) return;
      setApproving(true);
      try {
        const result = await assistantApi.confirm(proposal.id, pin);
        setProposal(undefined);
        setMessages((prior) => [
          ...prior,
          { role: 'assistant', content: result.reply, at: Date.now() },
        ]);
      } catch (error) {
        const failure = normaliseError(error);
        // A wrong PIN keeps the card so a typo is not a restart; anything else
        // means the proposal is gone and saying so is kinder than a dead card.
        const keepCard = failure.code === 'Q-401-PIN';
        if (!keepCard) setProposal(undefined);
        toast.error(failure.message);
      } finally {
        setApproving(false);
      }
    },
    [proposal],
  );

  const createPin = useCallback(
    async (pin: string) => {
      setApproving(true);
      try {
        await assistantApi.setPin(pin);
        // Set and used in one step: the user came here to approve something,
        // not to visit a settings page.
        setProposal((current) => current && { ...current, needsPinSetup: false });
        toast.success(t('assistant.pinCreated'));
      } catch (error) {
        toast.error(normaliseError(error).message);
      } finally {
        setApproving(false);
      }
    },
    [t],
  );

  const dismiss = useCallback(async () => {
    if (!proposal) return;
    const dismissed = proposal;
    setProposal(undefined);
    try {
      const result = await assistantApi.cancel(dismissed.id);
      setMessages((prior) => [
        ...prior,
        { role: 'assistant', content: result.reply, at: Date.now() },
      ]);
    } catch {
      // The card is already gone from the screen and the server drops it on the
      // next message anyway. Nothing useful to say here.
    }
  }, [proposal]);

  const reset = useCallback(async () => {
    await assistantApi.reset().catch(() => undefined);
    setMessages([]);
    setProposal(undefined);
  }, []);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:bg-black/20"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={t('assistant.title')}
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden border border-border bg-background shadow-xl',
          // Phone: a sheet from the bottom, clear of the tab bar.
          'inset-x-0 bottom-0 top-16 rounded-t-2xl',
          // Desktop: a column that does not cover what is being discussed.
          'md:inset-y-4 md:left-auto md:right-4 md:top-auto md:h-[min(42rem,calc(100vh-2rem))] md:w-[26rem] md:rounded-2xl',
        )}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{t('assistant.title')}</p>
            <p className="truncate text-xs text-muted-foreground">{t('assistant.disclosure')}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={reset} aria-label={t('assistant.reset')}>
            <RotateCcw className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('common.close')}>
            <X className="size-4" />
          </Button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-3 pt-6 text-center">
              <p className="text-sm text-muted-foreground">{t('assistant.empty')}</p>
              <div className="flex flex-col gap-2">
                {OPENERS.map((key) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => send(t(key))}
                  >
                    {t(key)}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.at}-${index}`}
                className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                    message.role === 'user'
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-muted text-foreground',
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          {proposal && (
            <ProposalCard
              proposal={proposal}
              busy={approving}
              onApprove={approve}
              onDismiss={dismiss}
              onCreatePin={createPin}
            />
          )}
        </div>

        <form
          className="flex items-end gap-2 border-t border-border px-3 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter breaks the line. Phone keyboards send
              // a newline rather than a submit, which the form handles.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send(draft);
              }
            }}
            placeholder={t('assistant.placeholder')}
            maxLength={2000}
            className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button type="submit" size="icon" disabled={!draft.trim() || sending}>
            <Send className="size-4" />
          </Button>
        </form>
      </aside>
    </>
  );
}
