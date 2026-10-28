'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, Clock, Paperclip, Send, ShieldCheck, Upload } from 'lucide-react';

import { StatusPill } from '@/components/ui/status-pill';
import { useAddEvidence, useDispute, useDisputeMessage, useWithdrawDispute } from '@/lib/hooks/use-disputes';
import type { DisputeDetail, DisputeEvidence, DisputeStatus as ApiDisputeStatus } from '@/lib/api/disputes.api';
import { filesToDataUrls } from '@/lib/files';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

type UiStatus = 'under_review' | 'resolved' | 'open';

const STATUS_TONE: Record<UiStatus, 'negative' | 'positive' | 'warning'> = {
  under_review: 'negative',
  resolved: 'positive',
  open: 'warning',
};

function toUiStatus(status: ApiDisputeStatus): UiStatus {
  if (status === 'RESOLVED' || status === 'AUTO_RULED') return 'resolved';
  if (status === 'FILED') return 'open';
  return 'under_review';
}

/** Initials from a full name, e.g. "Kwame Mensah" -> "KM". */
function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO -> "1 Aug · 10:12". */
function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date.getDate()} ${MONTHS[date.getMonth()]} · ${time}`;
}

/** Human outcome sentence for a resolved dispute. */
function rulingText(
  ruling: NonNullable<DisputeDetail['ruling']>,
  payeeName: string,
  payerName: string,
): string {
  if (ruling.ruling === 'FULL_RELEASE') return `Released to ${payeeName}.`;
  if (ruling.ruling === 'FULL_REFUND') return `Refunded to ${payerName}.`;
  const pct = ruling.freelancerPct;
  return `Split ${pct}% to ${payeeName}, ${100 - pct}% to ${payerName}.`;
}

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { data: dispute, isLoading, isError } = useDispute(params.id);

  const sendMessage = useDisputeMessage();
  const addEvidence = useAddEvidence();
  const withdraw = useWithdrawDispute();

  const [draft, setDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="size-6 animate-spin rounded-full border-2 border-brand-100 border-t-brand-500" />
      </div>
    );
  }

  if (isError || !dispute) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-bold text-ink">{t('disputes.notFound', { defaultValue: 'Dispute not found' })}</p>
        <Link href="/disputes" className="mt-2 text-[13px] font-semibold text-brand-700 hover:underline">
          ← {t('disputes.title')}
        </Link>
      </div>
    );
  }

  const status = toUiStatus(dispute.status);
  const resolved = status === 'resolved';
  const counterparty = dispute.viewerRole === 'payer' ? dispute.payeeName : dispute.payerName;
  const outcome = dispute.ruling ? rulingText(dispute.ruling, dispute.payeeName, dispute.payerName) : null;

  const submitMessage = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sendMessage.isPending) return;
    sendMessage.mutate(
      { id: dispute.id, body },
      { onSuccess: () => setDraft('') },
    );
  };

  const onPickEvidence = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const images = await filesToDataUrls(files);
    event.target.value = '';
    if (images.length > 0) addEvidence.mutate({ id: dispute.id, images });
  };

  const confirmWithdraw = () => {
    if (withdraw.isPending) return;
    if (typeof window !== 'undefined' && !window.confirm(t('disputes.detail.withdrawConfirm', {
      defaultValue: 'Withdraw this dispute? Funds return to review.',
    }))) {
      return;
    }
    withdraw.mutate(dispute.id);
  };

  const summaryCard = (
    <section className="rounded-2xl bg-[#F5F8FC] p-4">
      <dl className="space-y-2.5 text-[13px]">
        <SummaryRow label={t('disputes.detail.disputedAmount')}>
          <span className="font-extrabold text-ink">{formatMoney(dispute.amount, dispute.currency)}</span>
        </SummaryRow>
        <SummaryRow label={t('disputes.detail.deal')}>
          <Link href={`/deals/${dispute.contractId}`} className="font-bold text-brand-700 hover:underline">
            {dispute.contractTitle}
          </Link>
        </SummaryRow>
        <SummaryRow label={t('disputes.detail.counterparty')}>
          <span className="font-bold text-ink">{counterparty}</span>
        </SummaryRow>
        <SummaryRow label={t('disputes.reason', { defaultValue: 'Reason' })}>
          <span className="font-bold text-ink">{dispute.reasonLabel}</span>
        </SummaryRow>
        <SummaryRow label={t('disputes.detail.filed', { defaultValue: 'Filed by' })}>
          <span className="font-bold text-ink">
            {dispute.filedByYou ? t('disputes.detail.you') : dispute.filedByName}
          </span>
        </SummaryRow>
      </dl>
      {dispute.description ? (
        <p className="mt-3 border-t border-hairline pt-3 text-[13px] leading-relaxed text-muted-foreground">
          {dispute.description}
        </p>
      ) : null}
    </section>
  );

  const outcomeCard =
    resolved && outcome ? (
      <section className="rounded-2xl border border-positive-text/20 bg-positive-bg p-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-positive-text" />
          <h2 className="text-sm font-bold text-positive-text">{t('disputes.detail.resolved')}</h2>
        </div>
        <p className="mt-1.5 text-[13px] font-medium text-positive-text">
          {t('disputes.detail.outcome')}: {outcome}
        </p>
      </section>
    ) : null;

  const canAct = !resolved && (dispute.canAddEvidence || dispute.canWithdraw);

  const actionCard =
    outcomeCard ??
    (canAct ? (
      <section className="rounded-2xl border border-negative/20 bg-negative-bg-soft p-5">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-negative" />
          <h2 className="text-sm font-bold text-negative">{t('disputes.detail.nextStep')}</h2>
        </div>
        <p className="mt-2 text-[13px] font-medium text-negative">{dispute.reasonLabel}</p>
        {dispute.canAddEvidence ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={addEvidence.isPending}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-negative text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
          >
            <Upload className="size-4" />
            {t('disputes.detail.uploadFile')}
          </button>
        ) : null}
        {dispute.canWithdraw ? (
          <button
            type="button"
            onClick={confirmWithdraw}
            disabled={withdraw.isPending}
            className="mt-2 h-11 w-full rounded-xl border border-negative/30 bg-surface text-[13.5px] font-semibold text-negative transition hover:bg-negative-bg-soft disabled:opacity-60"
          >
            {t('disputes.detail.withdrawDispute')}
          </button>
        ) : null}
      </section>
    ) : null);

  return (
    <div className="space-y-4">
      {/* Hidden picker shared by every "add evidence" affordance */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPickEvidence}
        className="hidden"
      />

      {/* Back (mobile - no top bar) */}
      <Link
        href="/disputes"
        className="flex w-fit items-center gap-1.5 text-[14px] font-semibold text-brand-700 md:hidden"
      >
        <ArrowLeft className="size-4" />
        {t('disputes.title')}
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <StatusPill tone={STATUS_TONE[status]}>{t(`disputes.status.${status}`)}</StatusPill>
          <span className="text-[12.5px] font-semibold text-muted-foreground">#{dispute.id}</span>
        </div>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-[-0.4px] text-ink">{dispute.milestoneTitle}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* Summary sidebar (desktop right / mobile first) */}
        <div className="space-y-4 lg:order-2">
          {summaryCard}

          {/* Desktop-only action card */}
          <div className="hidden lg:block">{actionCard}</div>
        </div>

        {/* Thread + composer */}
        <section className="shadow-card flex flex-col rounded-2xl border border-hairline bg-surface p-5 md:p-6 lg:order-1">
          <h2 className="text-sm font-bold text-ink">{t('disputes.detail.evidence')}</h2>

          <div className="mt-4 space-y-5">
            {dispute.messages.length === 0 && dispute.evidence.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                {t('disputes.detail.noMessages', { defaultValue: 'No messages yet.' })}
              </p>
            ) : null}

            {dispute.messages.map((message) => (
              <MessageBubble
                key={message.id}
                mine={message.mine}
                name={message.mine ? t('disputes.detail.you') : message.senderName}
                time={formatMessageTime(message.createdAt)}
                text={message.body}
              />
            ))}

            {dispute.evidence.map((item) => (
              <EvidenceItem key={item.id} item={item} youLabel={t('disputes.detail.you')} />
            ))}
          </div>

          {/* Composer */}
          {dispute.canMessage ? (
            <form
              onSubmit={submitMessage}
              className="mt-5 flex items-center gap-2 rounded-2xl border border-hairline bg-surface p-2 pl-4 focus-within:border-brand-border"
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('disputes.detail.composerPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-subtle"
              />
              {dispute.canAddEvidence ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={addEvidence.isPending}
                  aria-label={t('disputes.detail.addEvidence')}
                  className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-ink disabled:opacity-60"
                >
                  <Paperclip className="size-[18px]" />
                </button>
              ) : null}
              <button
                type="submit"
                disabled={sendMessage.isPending || draft.trim().length === 0}
                aria-label={t('disputes.detail.send')}
                className="bg-primary shadow-brand flex size-9 items-center justify-center rounded-lg text-white transition hover:opacity-95 disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </form>
          ) : null}
        </section>
      </div>

      {/* Mobile-only footer action */}
      <div className="lg:hidden">
        {outcomeCard ??
          (dispute.canWithdraw ? (
            <button
              type="button"
              onClick={confirmWithdraw}
              disabled={withdraw.isPending}
              className="h-12 w-full rounded-xl border border-negative/30 bg-surface text-[14px] font-semibold text-negative transition hover:bg-negative-bg-soft disabled:opacity-60"
            >
              {t('disputes.detail.withdrawDispute')}
            </button>
          ) : null)}
      </div>
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function MessageBubble({
  mine,
  name,
  time,
  text,
}: {
  mine: boolean;
  name: string;
  time: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
          mine ? 'bg-brand-50 text-brand-700' : 'bg-muted text-muted-foreground',
        )}
      >
        {initialsOf(name) || <ShieldCheck className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-ink">{name}</span>
          <span className="text-[11px] text-muted-foreground">{time}</span>
        </div>
        <div
          className={cn(
            'mt-1.5 rounded-2xl px-4 py-3 text-[13px] leading-relaxed',
            mine ? 'bg-brand-50 text-ink' : 'bg-muted text-ink',
          )}
        >
          <p>{text}</p>
        </div>
      </div>
    </div>
  );
}

function EvidenceItem({ item, youLabel }: { item: DisputeEvidence; youLabel: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
        {initialsOf(item.mine ? youLabel : item.by) || <ShieldCheck className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-[13px] font-bold text-ink">{item.mine ? youLabel : item.by}</span>
        <div className="mt-1.5 rounded-2xl bg-muted px-4 py-3 text-[13px] leading-relaxed text-ink">
          {item.description ? <p>{item.description}</p> : null}
          {item.images.length > 0 ? (
            <div className={cn('flex flex-wrap gap-2', item.description ? 'mt-3' : '')}>
              {item.images.map((src, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={index}
                  src={src}
                  alt=""
                  className="size-16 rounded-lg object-cover"
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
