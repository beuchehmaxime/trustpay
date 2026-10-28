'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, AlertCircle } from 'lucide-react';

import { formatMoney } from '@/lib/format';

export interface ReleaseModalData {
  amount: number;
  currency: string;
  approx?: string;
  payeeName: string;
  payeeFirstName: string;
  milestoneIndex: number;
}

export function ReleaseModal({
  data,
  onCancel,
  onConfirm,
}: {
  data: ReleaseModalData | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!data) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [data, onCancel]);

  if (!data) return null;
  const money = formatMoney(data.amount, data.currency);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="animate-in fade-in-0 absolute inset-0 bg-ink/40 backdrop-blur-[1px] duration-200"
      />
      <div className="animate-in fade-in-0 zoom-in-95 relative w-full max-w-md rounded-[26px] bg-surface p-6 shadow-dialog duration-200">
        <span className="flex size-12 items-center justify-center rounded-full bg-positive-bg text-positive-text">
          <Check className="size-6" strokeWidth={2.5} />
        </span>
        <h2 className="mt-4 text-lg font-extrabold tracking-[-0.3px] text-ink">
          {t('deals.release.title', { amount: money, name: data.payeeFirstName })}
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          {t('deals.release.subtitle', { n: data.milestoneIndex })}
        </p>

        <div className="mt-4 rounded-2xl bg-[#F5F8FC] p-4">
          <dl className="space-y-2 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('deals.release.amount')}</dt>
              <dd className="font-semibold text-ink">{money}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('deals.release.fee')}</dt>
              <dd className="font-semibold text-ink">{formatMoney(0, data.currency)}</dd>
            </div>
          </dl>
          <div className="my-3 h-px bg-hairline" />
          <div className="flex items-end justify-between">
            <span className="text-sm font-bold text-ink">{t('deals.release.payeeReceives')}</span>
            <div className="text-right">
              <p className="text-lg font-extrabold text-ink">{money}</p>
              {data.approx ? <p className="text-[11px] text-muted-foreground">{data.approx}</p> : null}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl bg-negative-bg-soft px-3 py-2.5 text-[12.5px] font-medium text-negative">
          <AlertCircle className="size-4 shrink-0" />
          {t('deals.release.cannotUndo')}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-xl border border-hairline px-5 text-[13.5px] font-semibold text-ink transition hover:bg-muted"
          >
            {t('deals.release.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-11 rounded-xl bg-[#15803D] px-5 text-[13.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(21,128,61,0.5)] transition hover:bg-[#166534]"
          >
            {t('deals.release.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
