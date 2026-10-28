'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, ArrowUpDown, Check, ChevronDown, Clock } from 'lucide-react';

import { normaliseError } from '@/lib/api/client';
import { useConvert, useFxRate, useWallet } from '@/lib/hooks/use-wallet';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const plain = (value: number, decimals: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Short region tag shown in the chip - derived from the ISO currency code. */
const regionFor = (code: string) => code.slice(0, 2);

export default function ConvertPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { overview } = useWallet();
  const convertMutation = useConvert();
  // User-chosen currencies; null until the user picks, so we can derive sensible
  // defaults from the real wallet list once the overview loads.
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const [toOverride, setToOverride] = useState<string | null>(null);
  const [fromAmount, setFromAmount] = useState(1_000_000);

  // Selectable currencies come from the user's real wallets (no demo list).
  const wallets = overview?.wallets ?? [];
  const currencyCodes = wallets.map((entry) => entry.currency);
  const defaultFrom = currencyCodes[0] ?? '';
  const defaultTo = currencyCodes.find((code) => code !== defaultFrom) ?? '';
  const fromCode = fromOverride ?? defaultFrom;
  const toCode = toOverride ?? defaultTo;

  const balanceOf = (code: string) => wallets.find((entry) => entry.currency === code)?.balance ?? 0;
  const fromBalance = balanceOf(fromCode);
  const toBalance = balanceOf(toCode);

  const { data: fx } = useFxRate(fromCode, toCode, fromAmount || undefined);
  const hasQuote = Boolean(fx);
  // appliedRate = destination units per 1 source unit (toAmount = amount × rate).
  const appliedRate = fx?.appliedRate;
  const converted = fx?.toAmount;
  // rate = source units per 1 destination unit, for the "1 {to} = {rate} {from}" label.
  const rate = appliedRate && appliedRate > 0 ? 1 / appliedRate : undefined;
  const isLive = fx?.source === 'live' && fx.asOf !== null;
  const liveUpdatedTime = isLive && fx?.asOf ? new Date(fx.asOf).toLocaleTimeString() : null;
  const feePct = fx?.marginPct;
  const fee = feePct != null ? fromAmount * (feePct / 100) : undefined;
  const rateLabel =
    rate != null ? t('convert.rateLine', { to: toCode, rate: formatMoney(rate, fromCode) }) : '-';
  const convertedText = converted != null ? formatMoney(converted, toCode) : '-';
  const feeText = fee != null ? formatMoney(fee, fromCode) : '-';

  const exceeds = fromAmount > fromBalance;
  const canSubmit =
    fromAmount > 0 && Boolean(fromCode) && fromCode !== toCode && !exceeds && hasQuote && !convertMutation.isPending;

  const pickFrom = (code: string) => {
    if (code === toCode) setToOverride(fromCode);
    setFromOverride(code);
  };
  const pickTo = (code: string) => {
    if (code === fromCode) setFromOverride(toCode);
    setToOverride(code);
  };
  const swap = () => {
    setFromOverride(toCode);
    setToOverride(fromCode);
  };

  const confirmConvert = () => {
    if (!canSubmit) return;
    convertMutation.mutate(
      { fromCurrency: fromCode, toCurrency: toCode, amount: fromAmount },
      {
        onSuccess: () => {
          toast.success(t('convert.successToast'));
          router.push('/wallet');
        },
        onError: (error) => toast.error(normaliseError(error).message),
      },
    );
  };

  return (
    <>
      {/* ───────── Desktop (two-pane) ───────── */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h1 className="text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('convert.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('convert.subtitle')}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          {/* LEFT - converter */}
          <div className="space-y-5">
            <div className="shadow-card rounded-2xl border border-hairline bg-surface p-6">
              <div className="relative">
                {/* From */}
                <div className="rounded-2xl border border-hairline bg-[#F8FBFF] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[12.5px] font-semibold text-muted-foreground">{t('convert.from')}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {t('convert.availableBalance', { amount: formatMoney(fromBalance, fromCode, 0) })}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <RegionChip region={regionFor(fromCode)} />
                    <input
                      inputMode="numeric"
                      value={fromAmount ? fromAmount.toLocaleString('en-US') : ''}
                      onChange={(event) => setFromAmount(Number(event.target.value.replace(/[^\d]/g, '')) || 0)}
                      className="min-w-0 flex-1 bg-transparent text-[26px] font-extrabold text-ink outline-none"
                      aria-label={t('convert.from')}
                    />
                    <CurrencyCodeSelect value={fromCode} onChange={pickFrom} options={currencyCodes} />
                  </div>
                  {exceeds ? (
                    <p className="mt-2 text-[12px] font-medium text-negative">
                      {t('withdraw.overBalance')}
                    </p>
                  ) : null}
                </div>

                {/* Swap */}
                <div className="relative z-10 -my-3.5 flex justify-center">
                  <button
                    type="button"
                    onClick={swap}
                    className="bg-primary shadow-brand ring-bg flex size-10 items-center justify-center rounded-full text-white ring-4 transition hover:opacity-95"
                    aria-label="Swap currencies"
                  >
                    <ArrowUpDown className="size-4" />
                  </button>
                </div>

                {/* To */}
                <div className="rounded-2xl border border-brand-border bg-brand-50/50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[12.5px] font-semibold text-muted-foreground">{t('convert.to')}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {t('convert.balance', { amount: formatMoney(toBalance, toCode) })}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <RegionChip region={regionFor(toCode)} />
                    <span className="min-w-0 flex-1 truncate text-[26px] font-extrabold text-brand-700">
                      {converted != null ? plain(converted, 2) : '-'}
                    </span>
                    <CurrencyCodeSelect value={toCode} onChange={pickTo} options={currencyCodes} />
                  </div>
                </div>
              </div>

              {/* Quick destination currencies - sourced from the user's wallets */}
              {currencyCodes.filter((code) => code !== fromCode).length > 0 ? (
                <div className="mt-4 grid grid-cols-4 gap-2.5">
                  {currencyCodes
                    .filter((code) => code !== fromCode)
                    .map((code) => {
                      const active = toCode === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => pickTo(code)}
                          className={cn(
                            'rounded-xl py-2.5 text-[13px] font-semibold transition',
                            active ? 'bg-brand-50 text-brand-700' : 'bg-muted text-ink hover:bg-[#EBEFF5]',
                          )}
                        >
                          {code}
                        </button>
                      );
                    })}
                </div>
              ) : null}
            </div>
          </div>

          {/* RIGHT - summary */}
          <div className="space-y-5">
            <div className="shadow-card rounded-2xl border border-hairline bg-surface p-6">
              <h2 className="text-sm font-bold text-ink">{t('convert.beforeConfirm')}</h2>
              <dl className="mt-4 space-y-2.5 text-[13px]">
                <div className="flex justify-between">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
              {t('convert.rate')}
              {isLive ? <LiveBadge label={t('convert.live')} /> : null}
            </dt>
                  <dd className="font-semibold text-ink">{rateLabel}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('convert.amount')}</dt>
                  <dd className="font-semibold text-ink">{formatMoney(fromAmount, fromCode)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('convert.bizikFeePct', { pct: feePct ?? '-' })}</dt>
                  <dd className="font-semibold text-ink">− {feeText}</dd>
                </div>
              </dl>
              <div className="my-4 h-px bg-hairline" />
              <div className="flex items-end justify-between">
                <span className="text-sm font-bold text-ink">{t('convert.youGet')}</span>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-ink">{convertedText}</div>
                  <div className="text-[12px] text-muted-foreground">{t('convert.creditedNote', { currency: toCode })}</div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 rounded-xl bg-warning-bg-soft px-3 py-2.5 text-[12.5px] font-medium text-warning-text">
                <Clock className="size-3.5 shrink-0" />
                {isLive && liveUpdatedTime
                  ? t('convert.liveUpdated', { time: liveUpdatedTime })
                  : t('convert.rateLocked')}
              </div>
              <button
                type="button"
                onClick={confirmConvert}
                disabled={!canSubmit}
                className="bg-primary shadow-brand mt-4 h-12 w-full rounded-xl text-[15px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('convert.cta', { amount: convertedText })}
              </button>
              <Link
                href="/wallet"
                className="mt-2 flex h-11 w-full items-center justify-center rounded-xl border border-hairline text-sm font-semibold text-ink transition hover:bg-muted"
              >
                {t('convert.cancel')}
              </Link>
            </div>

            <div className="shadow-card rounded-2xl border border-hairline bg-surface p-6">
              <h2 className="text-sm font-bold text-ink">{t('convert.holdings')}</h2>
              <ul className="mt-4 space-y-3 text-[13px]">
                {wallets.map((entry) => (
                  <li key={entry.currency} className="flex items-center gap-2.5">
                    <RegionChip region={regionFor(entry.currency)} />
                    <span className="font-semibold text-ink">{entry.currency}</span>
                    <span className="ml-auto font-bold text-ink">{formatMoney(entry.balance, entry.currency, 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ───────── Mobile ───────── */}
      <div className="mx-auto w-full max-w-[560px] space-y-4 md:hidden">
      {/* Back (mobile - no top bar) */}
      <Link
        href="/wallet"
        className="flex w-fit items-center gap-1.5 text-[14px] font-semibold text-brand-700 md:hidden"
      >
        <ArrowLeft className="size-4" />
        {t('nav.wallet')}
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-[-0.4px] text-ink">{t('convert.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('convert.subtitle')}</p>
      </div>

      {/* From / To */}
      <div className="relative">
        {/* From */}
        <div className="shadow-card rounded-2xl border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-semibold text-muted-foreground">{t('convert.from')}</p>
            <p className="text-[12px] text-muted-foreground">
              {t('convert.availableBalance', { amount: formatMoney(fromBalance, fromCode, 0) })}
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <RegionChip region={regionFor(fromCode)} />
            <input
              inputMode="numeric"
              value={fromAmount ? fromAmount.toLocaleString('en-US') : ''}
              onChange={(event) => setFromAmount(Number(event.target.value.replace(/[^\d]/g, '')) || 0)}
              className="min-w-0 flex-1 bg-transparent text-[26px] font-extrabold text-ink outline-none"
              aria-label={t('convert.from')}
            />
            <CurrencyCodeSelect value={fromCode} onChange={pickFrom} options={currencyCodes} />
          </div>
          {exceeds ? (
            <p className="mt-2 text-[12px] font-medium text-negative">{t('withdraw.overBalance')}</p>
          ) : null}
        </div>

        {/* Swap */}
        <div className="relative z-10 -my-3.5 flex justify-center">
          <button
            type="button"
            onClick={swap}
            className="bg-primary shadow-brand ring-bg flex size-10 items-center justify-center rounded-full text-white ring-4 transition hover:opacity-95"
            aria-label="Swap currencies"
          >
            <ArrowUpDown className="size-4" />
          </button>
        </div>

        {/* To */}
        <div className="rounded-2xl border border-brand-border bg-brand-50/50 p-4">
          <p className="text-[12.5px] font-semibold text-muted-foreground">{t('convert.to')}</p>
          <div className="mt-2 flex items-center gap-2.5">
            <RegionChip region={regionFor(toCode)} />
            <span className="min-w-0 flex-1 truncate text-[26px] font-extrabold text-brand-700">
              {converted != null ? plain(converted, 2) : '-'}
            </span>
            <CurrencyCodeSelect value={toCode} onChange={pickTo} options={currencyCodes} />
          </div>
        </div>
      </div>

      {/* Rate breakdown */}
      <div className="rounded-2xl bg-[#F5F8FC] p-4">
        <dl className="space-y-2.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {t('convert.rate')}
              {isLive ? <LiveBadge label={t('convert.live')} /> : null}
            </dt>
            <dd className="font-semibold text-ink">{rateLabel}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('convert.bizikFeePct', { pct: feePct ?? '-' })}</dt>
            <dd className="font-semibold text-ink">{feeText}</dd>
          </div>
        </dl>
        <div className="my-3 h-px bg-hairline" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">{t('convert.youGet')}</span>
          <span className="text-lg font-extrabold text-ink">{convertedText}</span>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-warning-text">
          <Clock className="size-3.5 shrink-0" />
          {isLive && liveUpdatedTime
            ? t('convert.liveUpdated', { time: liveUpdatedTime })
            : t('convert.rateLocked')}
        </p>
      </div>

      {/* Convert button */}
      <button
        type="button"
        onClick={confirmConvert}
        disabled={!canSubmit}
        className="bg-primary shadow-brand h-12 w-full rounded-xl text-[15px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t('convert.cta', { amount: convertedText })}
      </button>
      <Link
        href="/wallet"
        className="flex h-11 w-full items-center justify-center rounded-xl border border-hairline text-sm font-semibold text-ink transition hover:bg-muted"
      >
        {t('convert.cancel')}
      </Link>
      </div>
    </>
  );
}

/** Tiny green "Live" pill: a pulsing dot + label, shown when the FX feed is live. */
function LiveBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-positive-bg px-1.5 py-0.5 text-[10px] font-semibold text-positive-text">
      <span className="size-1.5 rounded-full bg-positive" />
      {label}
    </span>
  );
}

function RegionChip({ region }: { region: string }) {
  return (
    <span className="flex h-6 min-w-8 items-center justify-center rounded bg-muted px-1 text-[10px] font-bold text-muted-foreground">
      {region}
    </span>
  );
}

function CurrencyCodeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (code: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 text-[13px] font-bold text-muted-foreground transition hover:text-ink"
      >
        {value}
        <ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 absolute right-0 top-[calc(100%+8px)] z-30 w-44 rounded-2xl border border-hairline bg-surface p-1.5 shadow-[0_20px_44px_-16px_rgba(15,23,42,0.28)] duration-150">
          {options.map((code) => {
            const selected = code === value;
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  onChange(code);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition',
                  selected ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-muted',
                )}
              >
                <RegionChip region={code.slice(0, 2)} />
                <span className="font-semibold">{code}</span>
                {selected ? <Check className="ml-auto size-4" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
