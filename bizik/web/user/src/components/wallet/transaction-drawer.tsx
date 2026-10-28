'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Briefcase,
  Check,
  ChevronRight,
  Copy,
  Download,
  Flag,
  Share2,
  X,
} from 'lucide-react';

import { StatusPill } from '@/components/ui/status-pill';
import { walletApi } from '@/lib/api/wallet.api';
import { type Transaction } from '@/lib/demo/transactions';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { TX_KIND_META, TX_STATUS_TONE, TX_TILE, txAmount } from './tx-meta';

interface TimelineStep {
  label: string;
  sub?: string;
  state: 'done' | 'current';
}

export function TransactionDrawer({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!transaction) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [transaction, onClose]);

  useEffect(() => {
    setCopied(false);
  }, [transaction]);

  if (!transaction) return null;

  const meta = TX_KIND_META[transaction.kind];
  const amount = txAmount(transaction);
  const detail = transaction.detail;
  const title = t(`tx.kind.${transaction.kind}`, transaction.titleParams);

  const gross = detail.grossOverride ?? transaction.amount;
  const grossCurrency = detail.grossCurrency ?? transaction.currency;
  const fee = detail.feeOverride ?? transaction.fee;
  const feeCurrency = detail.feeCurrency ?? transaction.currency;
  const net = detail.netOverride ?? transaction.amount - transaction.fee;
  const netCurrency = detail.netCurrency ?? transaction.currency;

  const at = `${transaction.dateLabel} · ${transaction.time}`;
  const timeline = buildTimeline(t, transaction, at);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(transaction.ref);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  // Save a Blob to the user's device as a downloaded file.
  const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // Download the server-rendered receipt PDF (real application/pdf file).
  const downloadReceipt = async () => {
    try {
      const { blob, fileName } = await walletApi.receiptPdf(transaction.ref);
      saveBlob(blob, fileName);
    } catch {
      toast.error(t('tx.detail.receiptError', { defaultValue: 'Could not generate the receipt.' }));
    }
  };

  // Share the receipt PDF as a file. Where the Web Share API can't attach files
  // (e.g. insecure origin / unsupported browser), fall back to downloading it.
  const shareReceipt = async () => {
    let received: { blob: Blob; fileName: string };
    try {
      received = await walletApi.receiptPdf(transaction.ref);
    } catch {
      toast.error(t('tx.detail.receiptError', { defaultValue: 'Could not generate the receipt.' }));
      return;
    }
    const { blob, fileName } = received;
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const shareData = { files: [file], title: t('tx.detail.eyebrow') };
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare(shareData) &&
      typeof navigator.share === 'function'
    ) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') saveBlob(blob, fileName);
      }
      return;
    }
    saveBlob(blob, fileName);
  };

  const reportProblem = () => {
    onClose();
    router.push('/support/new');
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-in fade-in-0 absolute inset-0 bg-ink/40 backdrop-blur-[1px] duration-200"
      />

      {/* Panel */}
      <aside className="animate-in slide-in-from-right relative flex h-full w-full max-w-[440px] flex-col bg-[#F6F8FC] shadow-[0_0_60px_-12px_rgba(11,31,58,0.4)] duration-200 ease-out">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-hairline bg-surface px-5 py-4">
          <span className={cn('flex size-10 items-center justify-center rounded-full', TX_TILE[meta.tone])}>
            <meta.icon className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
              {t('tx.detail.eyebrow')}
            </p>
            <h2 className="truncate text-[15px] font-bold text-ink">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full border border-hairline bg-surface text-muted-foreground transition hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Amount */}
          <div className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
            <p className={cn('text-[30px] font-extrabold tracking-[-0.5px]', amount.className)}>{amount.text}</p>
            {detail.approx ? <p className="mt-1 text-[13px] text-muted-foreground">{detail.approx}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill tone={TX_STATUS_TONE[transaction.status]}>
                {t(`tx.status.${transaction.status}`)}
              </StatusPill>
              <StatusPill tone="neutral">{t(`tx.filter.${transaction.category}`)}</StatusPill>
            </div>
          </div>

          {/* About */}
          <div className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
            <h3 className="text-sm font-bold text-ink">{t('tx.detail.about')}</h3>
            <p className="text-body mt-2 text-[13px] leading-relaxed">{detail.about}</p>
            {transaction.dealName ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-hairline bg-[#F7FAFF] px-3.5 py-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Briefcase className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                    {t('tx.detail.deal')}
                  </p>
                  <p className="truncate text-[13.5px] font-bold text-ink">{transaction.dealName}</p>
                </div>
                <ChevronRight className="size-4 text-subtle" />
              </div>
            ) : null}
          </div>

          {/* Breakdown */}
          <div className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
            <h3 className="text-sm font-bold text-ink">{t('tx.detail.breakdown')}</h3>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('tx.detail.gross')}</dt>
                <dd className="font-semibold text-ink">{formatMoney(gross, grossCurrency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('tx.detail.fee')}</dt>
                <dd className="font-semibold text-ink">{formatMoney(fee, feeCurrency)}</dd>
              </div>
            </dl>
            <div className="my-3 h-px bg-hairline" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-ink">{t('tx.detail.net')}</span>
              <span className="text-base font-extrabold text-ink">{formatMoney(net, netCurrency)}</span>
            </div>
          </div>

          {/* Details */}
          <div className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
            <h3 className="text-sm font-bold text-ink">{t('tx.detail.details')}</h3>
            <dl className="mt-3 space-y-2.5 text-[13px]">
              <DetailRow label={t('tx.detail.reference')} value={transaction.ref} mono />
              <DetailRow label={t('tx.detail.dateTime')} value={at} />
              {detail.counterparty ? (
                <DetailRow label={t('tx.detail.counterparty')} value={detail.counterparty} />
              ) : null}
              {detail.takenFrom ? <DetailRow label={t('tx.detail.takenFrom')} value={detail.takenFrom} /> : null}
              {detail.paidInto ? <DetailRow label={t('tx.detail.paidInto')} value={detail.paidInto} /> : null}
            </dl>
          </div>

          {/* Timeline */}
          <div className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
            <h3 className="text-sm font-bold text-ink">{t('tx.detail.timeline')}</h3>
            <ol className="mt-3 space-y-0">
              {timeline.map((step, index) => (
                <li key={step.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full',
                        step.state === 'current'
                          ? 'bg-brand-500 text-white ring-4 ring-brand-50'
                          : 'bg-positive-bg text-positive-text',
                      )}
                    >
                      {step.state === 'current' ? (
                        <span className="size-1.5 rounded-full bg-white" />
                      ) : (
                        <Check className="size-3" />
                      )}
                    </span>
                    {index < timeline.length - 1 ? <span className="my-1 w-px flex-1 bg-hairline" /> : null}
                  </div>
                  <div className={cn('pb-4', index === timeline.length - 1 && 'pb-0')}>
                    <p className="text-[13px] font-bold text-ink">{step.label}</p>
                    {step.sub ? <p className="text-[11.5px] text-muted-foreground">{step.sub}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer actions */}
        <div className="grid shrink-0 grid-cols-2 gap-2.5 border-t border-hairline bg-surface p-4">
          <button
            type="button"
            onClick={downloadReceipt}
            className="bg-primary shadow-brand flex h-11 items-center justify-center gap-2 rounded-xl text-[13px] font-semibold text-white transition hover:opacity-95"
          >
            <Download className="size-4" />
            {t('tx.detail.downloadReceipt')}
          </button>
          <button
            type="button"
            onClick={shareReceipt}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-hairline text-[13px] font-semibold text-ink transition hover:bg-muted"
          >
            <Share2 className="size-4" />
            {t('tx.detail.shareReceipt')}
          </button>
          <button
            type="button"
            onClick={copyReference}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-hairline text-[13px] font-semibold text-ink transition hover:bg-muted"
          >
            {copied ? <Check className="size-4 text-positive-text" /> : <Copy className="size-4" />}
            {copied ? t('tx.detail.copied') : t('tx.detail.copyReference')}
          </button>
          <button
            type="button"
            onClick={reportProblem}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-hairline text-[13px] font-semibold text-ink transition hover:bg-muted"
          >
            <Flag className="size-4" />
            {t('tx.detail.reportProblem')}
          </button>
        </div>
      </aside>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('text-right font-semibold text-ink', mono && 'tabular-nums')}>{value}</dd>
    </div>
  );
}

function buildTimeline(
  t: (key: string) => string,
  transaction: Transaction,
  at: string,
): TimelineStep[] {
  const paidInto = transaction.detail.paidInto;
  switch (transaction.kind) {
    case 'escrowReleased':
      return [
        { label: t('tx.step.requested'), sub: at, state: 'done' },
        { label: t('tx.step.settled'), sub: paidInto, state: 'done' },
      ];
    case 'escrowFunded':
      return [
        { label: t('tx.step.initiated'), sub: at, state: 'done' },
        { label: t('tx.step.held'), sub: paidInto, state: 'done' },
      ];
    case 'walletTopup':
    case 'currencyConversion':
      return [
        { label: t('tx.step.initiated'), sub: at, state: 'done' },
        { label: t('tx.step.settled'), sub: paidInto, state: 'done' },
      ];
    case 'withdraw':
      return transaction.status === 'pending'
        ? [
            { label: t('tx.step.requested'), sub: at, state: 'done' },
            { label: t('tx.step.processing'), sub: paidInto, state: 'current' },
          ]
        : [
            { label: t('tx.step.requested'), sub: at, state: 'done' },
            { label: t('tx.step.processing'), state: 'done' },
            { label: t('tx.step.settled'), sub: paidInto, state: 'done' },
          ];
    case 'escrowHeldDispute':
      return [
        { label: t('tx.step.requested'), sub: at, state: 'done' },
        { label: t('tx.step.held'), sub: paidInto, state: 'done' },
        { label: t('tx.step.underReview'), state: 'current' },
      ];
    default:
      return [{ label: t('tx.step.settled'), sub: at, state: 'done' }];
  }
}
