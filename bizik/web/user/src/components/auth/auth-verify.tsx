'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Info, Loader2, Mail } from 'lucide-react';

import { OtpInput } from './otp-input';
import { cn } from '@/lib/utils';
import { normaliseError, retryAfterSecondsOf } from '@/lib/api/client';

/**
 * Only used if the server told us nothing. The real wait escalates - a minute
 * for the first resend, five for the ones after - and only the server knows
 * which rung this number is on, so `waitSeconds` is what normally drives this.
 */
const FALLBACK_WAIT_SECONDS = 60;

/** A countdown a person can read, whether it is 45 seconds or nine hours. */
function formatWait(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

interface AuthVerifyProps {
  subtitle: ReactNode;
  code: string;
  setCode: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  onBack: () => void;
  length?: number;
  showResend?: boolean;
  /**
   * Seconds until another code may be requested, as the server reported it
   * when it sent the last one. The countdown used to be a hardcoded 45s that
   * simply disagreed with the server's 60 - so the button went live early,
   * the request was refused, and nothing happened.
   */
  waitSeconds?: number;
  /**
   * Whether a code actually went out. When false the user still has to verify,
   * but no new message is coming - usually because one was sent moments ago -
   * and the screen says so rather than letting them wait for nothing.
   */
  codeSent?: boolean;
  /**
   * Ask for another code. Resolves with the server's next wait, or rejects -
   * both are handled here, so a refused resend says why instead of pretending.
   */
  onResend?: () => Promise<{ retryAfterSeconds?: number } | void>;
}

export function AuthVerify({
  subtitle,
  code,
  setCode,
  onSubmit,
  pending,
  onBack,
  length = 6,
  showResend = true,
  waitSeconds,
  codeSent,
  onResend,
}: AuthVerifyProps) {
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(waitSeconds ?? FALLBACK_WAIT_SECONDS);
  const [resending, setResending] = useState(false);

  // Re-arm whenever the server hands down a new wait, including the one that
  // came with the code that put us on this screen.
  useEffect(() => {
    if (typeof waitSeconds === 'number') setSeconds(Math.max(0, Math.ceil(waitSeconds)));
  }, [waitSeconds]);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => (value > 0 ? value - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Hours matter here: the daily ceiling can leave a wait of several, and
  // mm:ss alone rendered that as "500:00", which reads like a bug.
  const mmss = formatWait(seconds);

  const resend = async () => {
    if (resending || !onResend) return;
    setResending(true);
    try {
      const result = await onResend();
      const next = result?.retryAfterSeconds;
      // Trust the server over any local guess: it knows which rung of the
      // escalation this number is on.
      setSeconds(typeof next === 'number' ? Math.ceil(next) : FALLBACK_WAIT_SECONDS);
      setCode('');
      toast(t('auth.verify.codeSent'), { description: t('auth.verify.codeSentBody') });
    } catch (error) {
      // A refusal carries the remaining wait, so the countdown restarts at the
      // real figure rather than letting the button go live again immediately.
      const waitFromError = retryAfterSecondsOf(error);
      if (waitFromError) setSeconds(Math.ceil(waitFromError));
      toast.error(normaliseError(error).message);
    } finally {
      setResending(false);
    }
  };

  return (
    // The explicit single column matters: a grid item's automatic minimum size
    // is its MIN-CONTENT, so the card refused to shrink below the width of the
    // six-box code row and overflowed its own parent - which is why the card
    // sat off-centre, hard against the right edge, on narrow phones.
    // `minmax(0,1fr)` drops that floor to zero so the card tracks the screen.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-[14px] font-semibold text-white/90 transition hover:text-white lg:text-muted-foreground lg:hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        {t('auth.back')}
      </button>

      <div className="rounded-3xl bg-white p-6 text-center shadow-[0_24px_60px_-20px_rgba(11,31,58,0.5)]">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Mail className="size-5" />
        </span>
        <h2 className="mt-4 text-xl font-extrabold tracking-[-0.3px] text-ink">{t('auth.verify.title')}</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{subtitle}</p>

        {codeSent === false ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900">
            {t('auth.verify.noNewCode')}
          </p>
        ) : null}

        <div className="mt-5">
          <OtpInput value={code} onChange={setCode} length={length} autoFocus />
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || code.length < length}
          className={cn(
            'mt-5 flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold transition',
            pending || code.length < length
              ? 'cursor-not-allowed bg-field text-white'
              : 'bg-primary text-white shadow-brand hover:opacity-95',
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : t('auth.verify.cta')}
        </button>

        {showResend ? (
          <div className="mt-3 text-[13px]">
            {seconds > 0 ? (
              <span className="text-muted-foreground">
                {t('auth.verify.resendIn', { time: mmss })}
              </span>
            ) : (
              <button
                type="button"
                onClick={resend}
                disabled={resending}
                className="font-semibold text-brand-600 transition hover:text-brand-700 disabled:opacity-60"
              >
                {resending ? t('common.loading') : t('auth.verify.resend')}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {showResend ? (
        <div className="flex items-start gap-2 rounded-2xl bg-white/15 px-4 py-3 text-[12.5px] leading-relaxed text-white/90 backdrop-blur lg:border lg:border-hairline lg:bg-surface lg:text-muted-foreground lg:backdrop-blur-none">
          <Info className="mt-0.5 size-4 shrink-0" />
          {t('auth.verify.notReceived')}
        </div>
      ) : null}
    </div>
  );
}
