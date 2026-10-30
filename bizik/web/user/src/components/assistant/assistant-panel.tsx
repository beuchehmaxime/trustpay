'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, Mic, RotateCcw, Send, Sparkles, Square, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  assistantApi,
  type AssistantMessage,
  type AssistantProposal,
} from '@/lib/api/assistant.api';
import { normaliseError } from '@/lib/api/client';
import {
  blobToBase64,
  canRecord,
  MAX_RECORDING_SECONDS,
  startRecording,
  type Recorder,
} from '@/lib/audio/wav-recorder';
import { cn } from '@/lib/utils';
import { AssistantText } from './assistant-text';
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

/**
 * How tall the composer may grow before it starts scrolling: six lines.
 *
 * Six because that is roughly a paragraph of someone explaining what went
 * wrong with an order, which is the longest thing anyone types here. Past it
 * the box would start eating the conversation it is a reply to.
 *
 * 20px is `leading-5`, and 16px is the `py-2` above and below. Computed rather
 * than written as a class so the number and the line count cannot drift apart.
 */
const COMPOSER_LINE_HEIGHT = 20;
const COMPOSER_MAX_LINES = 6;
const COMPOSER_MAX_HEIGHT = COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES + 16;

/** Suggestions for an empty thread. Deliberately not money actions. */
const OPENERS = [
  'assistant.openerBalance',
  'assistant.openerDeals',
  'assistant.openerDispute',
] as const;

export function AssistantPanel({
  open,
  voiceAvailable,
  onClose,
}: {
  open: boolean;
  voiceAvailable: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [proposal, setProposal] = useState<AssistantProposal | undefined>();
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [composerFocused, setComposerFocused] = useState(false);
  const recorderRef = useRef<Recorder | null>(null);
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

  /**
   * Grow the composer to fit what has been typed.
   *
   * Height is reset to `auto` first and only then read: `scrollHeight` on an
   * element that is already tall enough reports the height it currently has,
   * so without the reset the box can only ever grow and never shrink back
   * after a deletion. The CSS max-height takes over past that point and the
   * textarea scrolls, which is why nothing clamps it here.
   */
  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = 'auto';
    const wanted = Math.min(field.scrollHeight, COMPOSER_MAX_HEIGHT);
    field.style.height = `${wanted}px`;
    // Past the cap the box stops growing and scrolls instead. Pinning it to the
    // bottom keeps the caret in view, which is the whole reason someone wants a
    // field that grows: to see what they are still writing.
    if (field.scrollHeight > COMPOSER_MAX_HEIGHT) field.scrollTop = field.scrollHeight;
  }, [draft, composerFocused, open]);

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

  /**
   * Send a recording.
   *
   * The transcript is pushed into the thread as the user's own message, so
   * what the machine heard is on screen next to what it answered. When it
   * mishears "four" as "fourteen", that is the only way the user can tell why
   * the reply made no sense.
   */
  const sendVoice = useCallback(async (audio: Blob) => {
    setSending(true);
    setProposal(undefined);
    try {
      const base64 = await blobToBase64(audio);
      const result = await assistantApi.voice(base64);
      setMessages((prior) => [
        ...prior,
        { role: 'user', content: result.transcript, at: Date.now() },
        { role: 'assistant', content: result.reply, at: Date.now() },
      ]);
      setProposal(result.proposal);
    } catch (error) {
      toast.error(normaliseError(error).message);
    } finally {
      setSending(false);
    }
  }, []);

  const beginRecording = useCallback(async () => {
    if (recording || sending) return;
    // Browsers only expose a microphone on a secure origin. Opening the app at
    // http://192.168.x.x on a phone is the common way to hit this, and the
    // browser's own error says nothing useful, so name the actual rule.
    if (!canRecord()) {
      toast.error(t('assistant.micInsecure'));
      return;
    }
    try {
      recorderRef.current = await startRecording();
      setRecordedSeconds(0);
      setRecording(true);
    } catch {
      // Denied, or no microphone. Either way the typed path still works, so
      // say what happened rather than leaving a dead button.
      toast.error(t('assistant.micDenied'));
    }
  }, [recording, sending, t]);

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (!recorder) return;
    const audio = await recorder.stop();
    // Under a second is a mis-tap, not a message, and transcribing it costs a
    // call to come back empty.
    if (audio.size < 8000) {
      toast.error(t('assistant.micTooShort'));
      return;
    }
    await sendVoice(audio);
  }, [sendVoice, t]);

  // The clock, and the hard stop at the length the endpoint will accept.
  useEffect(() => {
    if (!recording) return;
    const tick = setInterval(() => {
      setRecordedSeconds((seconds) => {
        if (seconds + 1 >= MAX_RECORDING_SECONDS) void finishRecording();
        return seconds + 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [recording, finishRecording]);

  // Closing the panel mid-recording must release the microphone. Leaving the
  // track open keeps the browser's recording indicator lit over a panel that
  // is not even on screen.
  useEffect(() => {
    if (open) return;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
  }, [open]);

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
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                    message.role === 'user'
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-muted text-foreground',
                  )}
                >
                  {/* The user's own words are shown exactly as typed or
                      transcribed; only the assistant's are formatted. */}
                  {message.role === 'assistant' ? (
                    <AssistantText text={message.content} />
                  ) : (
                    <span className="whitespace-pre-wrap">{message.content}</span>
                  )}
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

        {recording ? (
          <div className="flex items-center gap-3 border-t border-border px-3 py-3">
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-destructive" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('assistant.listening')}</p>
              <p className="text-xs text-muted-foreground">
                {Math.floor(recordedSeconds / 60)}:
                {String(recordedSeconds % 60).padStart(2, '0')} / {MAX_RECORDING_SECONDS / 60}:00
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                recorderRef.current?.cancel();
                recorderRef.current = null;
                setRecording(false);
              }}
            >
              {t('assistant.dismiss')}
            </Button>
            <Button size="icon" onClick={finishRecording} aria-label={t('assistant.stopRecording')}>
              <Square className="size-4" />
            </Button>
          </div>
        ) : (
        <form
          className="flex items-end gap-2 border-t border-border px-3 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line. Phone keyboards
                // send a newline rather than a submit, which the form handles.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                }
              }}
              placeholder={t('assistant.placeholder')}
              maxLength={2000}
              className={cn(
                'w-full resize-none overflow-y-auto rounded-lg border border-border bg-background py-2 pl-3 text-sm leading-5 outline-none transition-[min-height]',
                'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                // Room on the right for the mic sitting inside the field.
                voiceAvailable ? 'pr-11' : 'pr-3',
                // Taller the moment it is in use, so what is being typed stays
                // visible instead of the first line scrolling out of sight.
                composerFocused || draft ? 'min-h-16' : 'min-h-10',
              )}
              style={{ maxHeight: `${COMPOSER_MAX_HEIGHT}px` }}
            />
            {/* Inside the field, at its right edge. Shown whenever the server
                has voice configured - `canRecord()` deliberately does NOT gate
                it, because that is false on any non-localhost HTTP address and
                a mic that silently vanishes when you open the app from your
                phone looks like a broken feature rather than a browser rule.
                It is shown, and clicking it says why. */}
            {voiceAvailable && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={sending}
                onClick={beginRecording}
                aria-label={t('assistant.startRecording')}
                title={t('assistant.startRecording')}
                className="absolute bottom-1.5 right-1.5 text-muted-foreground hover:text-foreground"
              >
                <Mic className="size-4" />
              </Button>
            )}
          </div>
          <Button type="submit" size="icon" disabled={!draft.trim() || sending}>
            <Send className="size-4" />
          </Button>
        </form>
        )}
      </aside>
    </>
  );
}
