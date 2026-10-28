'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Send, UserCircle2 } from 'lucide-react';

import { normaliseError } from '@/lib/api/client';
import { useRecipientLookup, useSendMoney } from '@/lib/hooks/use-transfer';
import { useWallet } from '@/lib/hooks/use-wallet';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const FIELD =
  'h-12 w-full rounded-xl border border-hairline bg-surface px-3.5 text-[15px] text-ink outline-none transition placeholder:text-subtle focus:border-brand-border';

/** A one-off key for this attempt, so a retry can't pay twice. */
function randomKey(): string {
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Send money to another BiZik user by @handle (or phone). The screen is built
 * around one idea: you cannot send until you have SEEN the name of the person
 * who will receive it - a transfer is final.
 */
export default function SendMoneyPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { homeCurrency, walletBalance } = useWallet();
  const send = useSendMoney();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<{ name: string; label: string; amount: number } | null>(null);

  const { result: lookup, checking } = useRecipientLookup(recipient);
  const idempotencyKey = useRef<string>('');

  const value = Number(amount.replace(',', '.')) || 0;
  const problem = useMemo(() => {
    if (!lookup?.found || value <= 0) return null;
    if (value > walletBalance) return t('transfer.send.insufficient');
    return null;
  }, [lookup, value, walletBalance, t]);

  const canSend = !!lookup?.found && value > 0 && !problem && !send.isPending;

  const submit = () => {
    if (!canSend || !lookup?.found) return;
    const label = lookup.username ? `@${lookup.username}` : recipient.trim();
    const confirmed = window.confirm(
      t('transfer.send.confirmMessage', {
        amount: formatMoney(value, homeCurrency),
        name: lookup.fullName,
        handle: label,
      }),
    );
    if (!confirmed) return;
    if (!idempotencyKey.current) idempotencyKey.current = randomKey();
    send.mutate(
      {
        to: recipient.trim(),
        amount: value,
        currency: homeCurrency,
        note: note.trim() || undefined,
        idempotencyKey: idempotencyKey.current,
      },
      {
        onSuccess: (result) => {
          idempotencyKey.current = randomKey();
          setSent({
            name: result.recipient.fullName,
            label: result.recipient.label,
            amount: result.amount,
          });
        },
        onError: (error) => toast.error(normaliseError(error).message),
      },
    );
  };

  if (sent) {
    return (
      <div className="mx-auto flex w-full max-w-[520px] flex-col items-center py-16 text-center">
        <CheckCircle2 className="size-16 text-positive" />
        <h1 className="mt-5 text-xl font-extrabold text-ink">{t('transfer.send.sentTitle')}</h1>
        <p className="mt-1 text-[26px] font-extrabold text-ink">
          {formatMoney(sent.amount, homeCurrency)}
        </p>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          {t('transfer.send.sentBody', { name: sent.name, handle: sent.label })}
        </p>
        <button
          type="button"
          onClick={() => router.push('/wallet')}
          className="bg-primary shadow-brand mt-6 h-12 w-full rounded-xl text-sm font-semibold text-white transition hover:opacity-95"
        >
          {t('transfer.send.done')}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-5">
      <Link href="/wallet" className="flex items-center gap-1.5 text-[14px] font-semibold text-brand-700">
        <ArrowLeft className="size-4" />
        {t('transfer.send.navTitle')}
      </Link>

      <section className="shadow-card space-y-4 rounded-2xl border border-hairline bg-surface p-5">
        {/* Who */}
        <div>
          <label htmlFor="recipient" className="text-[13px] font-semibold text-muted-foreground">
            {t('transfer.send.toLabel')}
          </label>
          <div className="relative mt-1.5">
            <input
              id="recipient"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              autoComplete="off"
              placeholder={t('transfer.send.toPlaceholder')}
              className={FIELD}
            />
            {checking ? (
              <Loader2 className="absolute right-3 top-3.5 size-5 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          {lookup?.found ? (
            <p className="mt-2 flex items-center gap-2 rounded-xl bg-positive-bg px-3 py-2 text-[13px] font-semibold text-positive-text">
              <UserCircle2 className="size-4 shrink-0" />
              {lookup.fullName}
              {lookup.username ? ` · @${lookup.username}` : ''}
            </p>
          ) : recipient.trim().length >= 3 && !checking ? (
            <p className="mt-2 text-[12.5px] text-negative">
              {lookup && 'self' in lookup && lookup.self
                ? t('transfer.send.self')
                : t('transfer.send.notFound')}
            </p>
          ) : (
            <p className="mt-2 text-[12.5px] text-muted-foreground">{t('transfer.send.toHint')}</p>
          )}
        </div>

        {/* How much */}
        <div>
          <label htmlFor="amount" className="text-[13px] font-semibold text-muted-foreground">
            {t('transfer.send.amountLabel', { currency: homeCurrency })}
          </label>
          <input
            id="amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            className={cn(FIELD, 'mt-1.5 text-[20px] font-extrabold')}
          />
          <p className={cn('mt-2 text-[12.5px]', problem ? 'text-negative' : 'text-muted-foreground')}>
            {problem ?? t('transfer.send.available', { amount: formatMoney(walletBalance, homeCurrency) })}
          </p>
        </div>

        {/* What for */}
        <div>
          <label htmlFor="note" className="text-[13px] font-semibold text-muted-foreground">
            {t('transfer.send.noteLabel')}
          </label>
          <input
            id="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={140}
            placeholder={t('transfer.send.notePlaceholder')}
            className={cn(FIELD, 'mt-1.5')}
          />
        </div>
      </section>

      {/* The honest warning: this is not escrow */}
      <section className="flex gap-3 rounded-2xl bg-warning-bg-soft p-4">
        <AlertTriangle className="size-5 shrink-0 text-warning-text" />
        <div>
          <p className="text-[13px] font-bold text-warning-text">{t('transfer.send.warnTitle')}</p>
          <p className="text-body mt-1 text-[12.5px] leading-relaxed">{t('transfer.send.warnBody')}</p>
          <Link href="/deals/new" className="mt-2 inline-block text-[12.5px] font-bold text-brand-700">
            {t('transfer.send.useEscrow')} →
          </Link>
        </div>
      </section>

      <button
        type="button"
        disabled={!canSend}
        onClick={submit}
        className="bg-primary shadow-brand flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
      >
        <Send className="size-4" />
        {send.isPending ? t('transfer.send.sending') : t('transfer.send.cta')}
      </button>
    </div>
  );
}
