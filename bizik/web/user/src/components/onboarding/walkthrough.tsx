'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Handshake,
  LifeBuoy,
  Send,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth/auth.store';
import { setTourOpen } from '@/lib/onboarding/tour-state';

/**
 * The welcome, and the tour of what this app is for.
 *
 * Shown once to a new account. Somebody who has just signed up is looking at a
 * dashboard of empty states - no deals, no balance, no activity - and nothing on
 * it explains what escrow is, why verification is asked for, or which of the
 * four tabs does the thing they came to do. The tour answers that in the order
 * they will need it.
 *
 * It is a walkthrough, not a tutorial to sit through: every step is skippable,
 * the whole thing is dismissible, and a step the user has already completed is
 * shown as done rather than instructed. Telling a verified user to verify is
 * how a product teaches people to dismiss its own guidance.
 *
 * Progress is kept per-account in localStorage. That means a new device shows
 * it again, which is the right trade: the alternative is a server round trip and
 * a migration for a per-device convenience, and seeing the tour once more on a
 * new phone is not a harm.
 */

interface Step {
  key: string;
  icon: React.ReactNode;
  tone: string;
  /** Where this step takes the user, if they act on it now. */
  href?: string;
  /** Already true for this account? Then it is shown done, not instructed. */
  done?: boolean;
}

function storageKey(userId: string): string {
  return `bizik.walkthrough.${userId}`;
}

/** Has this account already been through it? Never throws on blocked storage. */
function alreadySeen(userId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(userId)) === 'done';
  } catch {
    // Private browsing or blocked storage. Showing the tour again is a far
    // smaller problem than a crash on the first screen after signup.
    return false;
  }
}

function markSeen(userId: string): void {
  try {
    window.localStorage.setItem(storageKey(userId), 'done');
  } catch {
    // Nothing to do: it will be shown again next time, which is harmless.
  }
}

export function Walkthrough() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);

  /**
   * Whether this account has already been through the tour.
   *
   * useSyncExternalStore rather than an effect that calls setState, because
   * localStorage does not exist during the server render. The server snapshot
   * says "seen", so nothing is rendered server-side and React swaps in the real
   * answer on the client without a hydration mismatch - which reading storage
   * in a render, or setting state from an effect, would both produce.
   */
  const seen = useSyncExternalStore(
    () => () => undefined, // nothing mutates it mid-session
    () => (user?.id ? alreadySeen(user.id) : true),
    () => true,
  );
  const open = !seen && !dismissed;

  // Published so the install prompt can stay out of the way. Both are
  // full-screen modals, and the install card renders above this one - a new
  // account got both at once with its buttons covered.
  useEffect(() => {
    setTourOpen(open);
    return () => setTourOpen(false);
  }, [open]);

  const steps = useMemo<Step[]>(() => {
    const verified = Boolean(user?.verified);
    return [
      {
        key: 'welcome',
        icon: <Sparkles className="size-5" />,
        tone: 'bg-brand-50 text-brand-600',
      },
      {
        key: 'verify',
        icon: <BadgeCheck className="size-5" />,
        tone: 'bg-violet-50 text-violet-600',
        href: '/settings/kyc',
        done: verified,
      },
      {
        key: 'wallet',
        icon: <Wallet className="size-5" />,
        tone: 'bg-emerald-50 text-emerald-600',
        href: '/wallet',
      },
      {
        // After the wallet and before deals: it is the simplest thing you can
        // do with a balance, and it is the step that explains what a handle is -
        // which the deal flow then relies on.
        key: 'send',
        icon: <Send className="size-5" />,
        tone: 'bg-cyan-50 text-cyan-600',
        href: '/wallet/send',
      },
      {
        key: 'deal',
        icon: <Handshake className="size-5" />,
        tone: 'bg-amber-50 text-amber-600',
        href: '/deals/new',
      },
      {
        key: 'help',
        icon: <LifeBuoy className="size-5" />,
        tone: 'bg-sky-50 text-sky-600',
        href: '/support',
      },
    ];
  }, [user?.verified]);

  if (!open || !user?.id) return null;

  const step = steps[index];
  const isLast = index === steps.length - 1;

  function close() {
    if (user?.id) markSeen(user.id);
    // Local state as well as storage: the external store is only read once per
    // session, so without this the tour would not close until a reload.
    setDismissed(true);
  }

  function next() {
    if (isLast) close();
    else setIndex((current) => current + 1);
  }

  function goNow() {
    if (!step.href) return next();
    close();
    router.push(step.href);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkthrough-title"
    >
      <div className="w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', step.tone)}
          >
            {step.done ? <Check className="size-5" /> : step.icon}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label={t('common.close')}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <h2 id="walkthrough-title" className="mt-4 text-[19px] font-extrabold text-ink">
          {step.key === 'welcome'
            ? t('walkthrough.welcome.title', {
                // First name only. The greeting reads as a person speaking, and
                // a full legal name in a welcome message does not.
                name: (user.fullName ?? '').trim().split(/\s+/)[0] ?? '',
              })
            : t(`walkthrough.${step.key}.title`)}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {step.done
            ? t(`walkthrough.${step.key}.done`)
            : t(`walkthrough.${step.key}.body`)}
        </p>

        {/* Progress. Dots rather than "3 of 5" so it reads as short, which it is. */}
        <div className="mt-6 flex items-center gap-1.5">
          {steps.map((entry, position) => (
            <span
              key={entry.key}
              className={cn(
                'h-1.5 rounded-full transition-all',
                position === index ? 'w-6 bg-brand-600' : 'w-1.5 bg-hairline',
              )}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center gap-2">
          {step.href && !step.done ? (
            <button
              type="button"
              onClick={goNow}
              className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-[14px] font-bold text-white transition hover:opacity-95"
            >
              {t(`walkthrough.${step.key}.cta`)}
            </button>
          ) : null}
          <button
            type="button"
            onClick={next}
            className={cn(
              'rounded-xl px-4 py-3 text-[14px] font-bold transition',
              step.href && !step.done
                ? 'border border-hairline text-ink hover:bg-muted'
                : 'flex-1 bg-brand-600 text-white hover:opacity-95',
            )}
          >
            {isLast ? t('walkthrough.finish') : t('walkthrough.next')}
            {!isLast && !(step.href && !step.done) ? (
              <ArrowRight className="ml-1.5 inline size-4" />
            ) : null}
          </button>
        </div>

        {!isLast ? (
          <button
            type="button"
            onClick={close}
            className="mt-3 w-full text-center text-[13px] font-medium text-muted-foreground transition hover:text-ink"
          >
            {t('walkthrough.skip')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
