'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  BadgeCheck,
  Camera,
  Check,
  Clock,
  IdCard,
  Loader2,
  Lock,
  ScanFace,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import { StatusPill } from '@/components/ui/status-pill';
import { useAuthStore } from '@/lib/auth/auth.store';
import { useCountries } from '@/lib/hooks/use-countries';
import { useKycStatus, useSubmitKyc } from '@/lib/hooks/use-kyc';
import type { KycIdType, KycStatusResponse } from '@/lib/api/kyc.api';
import { normaliseError } from '@/lib/api/client';
import { imageToDataUrl } from '@/lib/image-downscale';
import { cn } from '@/lib/utils';

const TOTAL_STEPS = 4;

type IdType = 'national' | 'passport' | 'drivers';

/** Web ID-type value → backend enum. */
const ID_TYPE_MAP: Record<IdType, KycIdType> = {
  national: 'NATIONAL_ID',
  passport: 'PASSPORT',
  drivers: 'DRIVERS_LICENSE',
};

export default function KycPage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const { data: status, isLoading, isError, refetch } = useKycStatus();
  const submitKyc = useSubmitKyc();

  const [step, setStep] = useState(1);
  const [idType, setIdType] = useState<IdType>('national');
  const [idNumber, setIdNumber] = useState('');
  const [idFront, setIdFront] = useState<string | null>(null);
  const [idBack, setIdBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);

  const countries = useCountries();
  /**
   * The country is EDITABLE here, not a read-only echo of the profile.
   *
   * Signup does not ask for a country (it asks for as little as possible), so
   * `user.country` is empty for every account created in the app - which made
   * this field render a permanent "-" and left verification impossible to
   * finish. The backend already saves whatever is submitted here onto the
   * profile, so this screen is the right place to ask.
   */
  const [pickedCountry, setPickedCountry] = useState('');
  const country = pickedCountry || user?.country || '';
  const phone = user?.phone ?? '';
  const needsBack = idType !== 'passport';

  const idTypes: { value: IdType; label: string; icon: typeof IdCard }[] = [
    { value: 'national', label: t('settings.kyc.idNational'), icon: IdCard },
    { value: 'passport', label: t('settings.kyc.idPassport'), icon: BadgeCheck },
    { value: 'drivers', label: t('settings.kyc.idDrivers'), icon: IdCard },
  ];
  const idTypeLabel = idTypes.find((option) => option.value === idType)?.label ?? '';

  async function submit() {
    if (!country) {
      toast.error(t('settings.kyc.countryRequired'));
      setStep(1);
      return;
    }
    if (!idFront || !selfie || (needsBack && !idBack)) {
      toast.error(t('settings.kyc.documentsRequired', { back: needsBack ? t('settings.kyc.andBack') : '' }));
      return;
    }
    try {
      await submitKyc.mutateAsync({
        country,
        phone: phone.trim(),
        idType: ID_TYPE_MAP[idType],
        idNumber: idNumber.trim(),
        documents: { idFront, ...(needsBack && idBack ? { idBack } : {}), selfie },
      });
      toast.success(t('settings.kyc.submitted'));
      // The submission is what puts a country on the account, so the cached user
      // is now stale - without this the profile screen keeps showing "-" for a
      // country they just gave us.
      void refreshUser();
      // The refreshed status flips the view to the read-only status card below.
    } catch (error) {
      toast.error(normaliseError(error).message || t('settings.kyc.submitError'));
    }
  }

  // ── Loading / error (no cached status yet) ────────────────────────────────
  if (isLoading && !status) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-brand-500" />
      </div>
    );
  }
  if (isError && !status) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-3 py-20 text-center">
        <p className="text-[13px] text-negative">{t('settings.kyc.loadError')}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-xl border border-hairline px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-muted"
        >
          {t('settings.payouts.retry')}
        </button>
      </div>
    );
  }

  // ── Terminal / in-progress states → read-only status card ─────────────────
  const statusValue = status?.status;
  if (status && (statusValue === 'APPROVED' || statusValue === 'SUBMITTED' || statusValue === 'UNDER_REVIEW')) {
    return <StatusView status={status} />;
  }

  // ── Wizard (NOT_STARTED or REJECTED) ──────────────────────────────────────
  const headerTitle =
    step === 2 ? t('settings.kyc.captureTitle') : step === 3 ? t('settings.kyc.reviewTitle') : t('settings.kyc.title');
  const headerSubtitle =
    step === 2
      ? t('settings.kyc.captureSubtitle')
      : step === 3
        ? t('settings.kyc.reviewSubtitle')
        : t('settings.kyc.subtitle');

  return (
    <div className="mx-auto w-full max-w-[560px]">
      {/* Full-width header band - flush to the top/side edges on mobile, inset card on desktop */}
      <div className="-mx-4 -mt-4 border-b border-hairline bg-surface px-4 pb-4 pt-5 md:mx-0 md:mt-0 md:rounded-2xl md:border md:px-6 md:pt-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold text-ink">{headerTitle}</h1>
          <span className="shrink-0 text-[12.5px] font-semibold text-muted-foreground">
            {t('settings.kyc.step', { n: step, total: TOTAL_STEPS })}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">{headerSubtitle}</p>

        {/* Progress segments */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <span key={index} className={cn('h-1.5 rounded-full', index < step ? 'bg-brand-500' : 'bg-[#EEF2F7]')} />
          ))}
        </div>
      </div>

      {/* Rejection notice - resubmitting after a REJECTED result */}
      {statusValue === 'REJECTED' && status?.rejectionReason ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-negative-bg-soft px-3.5 py-3 text-[12px] font-medium text-negative">
          <ShieldAlert className="size-4 shrink-0" />
          {status.rejectionReason}
        </p>
      ) : null}

      {/* Step 1 - Your identity */}
      {step === 1 ? (
        <div className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="kyc-country"
              className="mb-1.5 block text-[12.5px] font-semibold text-body"
            >
              {t('settings.kyc.country')}
            </label>
            <select
              id="kyc-country"
              value={country}
              onChange={(event) => setPickedCountry(event.target.value)}
              disabled={countries.isLoading}
              className="h-12 w-full appearance-none rounded-xl border border-hairline bg-surface px-3.5 text-[14px] font-semibold text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:opacity-60"
            >
              <option value="" disabled>
                {countries.isLoading
                  ? t('settings.kyc.countryLoading')
                  : t('settings.kyc.countryPlaceholder')}
              </option>
              {countries.data?.map((market) => (
                <option key={market.name} value={market.name}>
                  {market.flag ? `${market.flag}  ` : ''}
                  {market.name}
                </option>
              ))}
            </select>
            {countries.isError ? (
              <p className="mt-1.5 text-[11.5px] text-negative">
                {t('settings.kyc.countryLoadFailed')}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-[12.5px] font-semibold text-body">{t('settings.kyc.idType')}</label>
            <div className="space-y-2.5">
              {idTypes.map((option) => {
                const selected = idType === option.value;
                const OptionIcon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setIdType(option.value)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition',
                      selected ? 'border-brand-500 bg-brand-50/60' : 'border-hairline bg-surface hover:border-brand-border',
                    )}
                  >
                    <OptionIcon className={cn('size-[18px]', selected ? 'text-brand-600' : 'text-muted-foreground')} />
                    <span className={cn('flex-1 text-[14px] font-bold', selected ? 'text-brand-700' : 'text-ink')}>
                      {option.label}
                    </span>
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full border',
                        selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-field',
                      )}
                    >
                      {selected ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12.5px] font-semibold text-body">{t('settings.kyc.idNumber')}</label>
            <input
              value={idNumber}
              onChange={(event) => setIdNumber(event.target.value)}
              className="h-12 w-full rounded-xl border border-hairline bg-surface px-3.5 text-[14px] text-ink outline-none transition placeholder:text-subtle focus:border-brand-border"
            />
          </div>

          {/* No country, no submission: the backend refuses one, and finding
              that out three steps later after uploading photos is the worst
              possible moment. */}
          <PrimaryButton onClick={() => setStep(2)} disabled={!country}>
            {t('settings.kyc.continue')}
          </PrimaryButton>
        </div>
      ) : null}

      {/* Step 2 - Capture your ID */}
      {step === 2 ? (
        <div className="mt-5 space-y-4">
          <DocSlot title={t('settings.kyc.idFront')} value={idFront} onPick={setIdFront} />
          {needsBack ? <DocSlot title={t('settings.kyc.idBack')} value={idBack} onPick={setIdBack} /> : null}
          <DocSlot title={t('settings.kyc.selfie')} value={selfie} onPick={setSelfie} selfie />

          <StepFooter onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel={t('settings.kyc.continue')} />
        </div>
      ) : null}

      {/* Step 3 - Review & submit */}
      {step === 3 ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-hairline bg-surface p-4">
            <dl className="space-y-2.5">
              <ReviewRow label={t('settings.kyc.rowCountry')}>{country || '-'}</ReviewRow>
              <ReviewRow label={t('settings.kyc.rowIdType')}>{idTypeLabel}</ReviewRow>
              <ReviewRow label={t('settings.kyc.rowIdNumber')}>{idNumber || '-'}</ReviewRow>
              <ReviewRow label={t('settings.kyc.rowPhone')}>{phone || '-'}</ReviewRow>
            </dl>
            <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-hairline pt-4">
              <ReviewThumb src={idFront} fallback={IdCard} />
              <ReviewThumb src={needsBack ? idBack : null} fallback={IdCard} />
              <ReviewThumb src={selfie} fallback={UserRound} />
            </div>
          </div>

          <p className="flex items-center gap-2 rounded-xl bg-brand-50/60 px-3.5 py-3 text-[12px] text-brand-700">
            <Lock className="size-4 shrink-0" />
            {t('settings.kyc.encryptedNote')}
          </p>

          <StepFooter
            onBack={() => setStep(2)}
            onNext={submit}
            nextLabel={t('settings.kyc.submit')}
            loading={submitKyc.isPending}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Read-only verification status card (APPROVED / SUBMITTED / UNDER_REVIEW). */
function StatusView({ status }: { status: KycStatusResponse }) {
  const { t } = useTranslation();
  const approved = status.status === 'APPROVED';

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="-mx-4 -mt-4 border-b border-hairline bg-surface px-4 pb-4 pt-5 md:mx-0 md:mt-0 md:rounded-2xl md:border md:px-6 md:pt-6">
        <h1 className="text-xl font-extrabold text-ink">{t('settings.kyc.statusTitle')}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t('settings.kyc.statusSubtitle')}</p>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-2xl border border-hairline bg-surface p-6 text-center">
          <span
            className={cn(
              'mx-auto flex size-14 items-center justify-center rounded-2xl',
              approved ? 'bg-positive-bg text-positive-text' : 'bg-warning-bg text-warning-text',
            )}
          >
            {approved ? <ShieldCheck className="size-7" /> : <Clock className="size-7" />}
          </span>
          <h2 className="mt-3 text-lg font-extrabold text-ink">
            {approved ? t('settings.kyc.verifiedTitle') : t('settings.kyc.reviewTitleStatus')}
          </h2>
          <p className="mx-auto mt-1.5 max-w-[360px] text-[13px] leading-relaxed text-muted-foreground">
            {approved ? t('settings.kyc.verifiedBody') : t('settings.kyc.reviewBody')}
          </p>
          {approved ? (
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-[#F5F8FC] px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">{t('settings.kyc.tier')}</p>
                <p className="mt-0.5 text-[15px] font-extrabold text-ink">
                  {t('settings.kyc.tierValue', { n: status.tier })}
                </p>
              </div>
              <div className="rounded-xl bg-[#F5F8FC] px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">{t('settings.kyc.statusTitle')}</p>
                <p className="mt-0.5 text-[15px] font-extrabold text-ink">{status.tierLabel}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** A single capture slot: file-input backed (web has no live camera). */
function DocSlot({
  title,
  value,
  onPick,
  selfie = false,
}: {
  title: string;
  value: string | null;
  onPick: (dataUrl: string) => void;
  selfie?: boolean;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      onPick(await imageToDataUrl(file));
    } catch {
      toast.error(t('settings.kyc.submitError'));
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold text-ink">{title}</p>
        {value ? <StatusPill tone="positive">{t('settings.kyc.captured')}</StatusPill> : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={selfie ? 'user' : 'environment'}
        onChange={handleChange}
        className="hidden"
      />

      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={title} className="mt-3 h-28 w-full rounded-xl object-cover" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 h-11 w-full rounded-xl border border-hairline text-[13.5px] font-semibold text-brand-600 transition hover:bg-brand-50/50"
          >
            {t('settings.kyc.retake')}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-field text-muted-foreground transition hover:border-brand-border"
          >
            {selfie ? <ScanFace className="size-6" /> : <Camera className="size-6" />}
            <span className="text-[12px] font-medium">
              {selfie ? t('settings.kyc.selfieHint') : t('settings.kyc.tapToCapture')}
            </span>
          </button>
          <div className="mt-3 flex gap-2.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="bg-primary h-11 flex-1 rounded-xl text-[13.5px] font-semibold text-white transition hover:opacity-95"
            >
              {t('settings.kyc.openCamera')}
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="h-11 flex-1 rounded-xl border border-hairline text-[13.5px] font-semibold text-ink transition hover:bg-muted"
            >
              {t('settings.kyc.uploadFile')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ReviewThumb({ src, fallback: Fallback }: { src: string | null; fallback: typeof IdCard }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="h-14 w-full rounded-xl object-cover" />;
  }
  return (
    <span className="flex h-14 items-center justify-center rounded-xl bg-[#EEF3F9] text-subtle">
      <Fallback className="size-5" />
    </span>
  );
}

function PrimaryButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-primary shadow-brand h-12 w-full rounded-xl text-[14.5px] font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function StepFooter({
  onBack,
  onNext,
  nextLabel,
  loading = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2.5">
      <button
        type="button"
        onClick={onBack}
        className="h-12 rounded-xl border border-hairline px-6 text-[13.5px] font-semibold text-ink transition hover:bg-muted"
      >
        {t('settings.kyc.back')}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={loading}
        className="bg-primary shadow-brand flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[14.5px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        {nextLabel}
      </button>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-right text-[13px] font-bold text-ink">{children}</dd>
    </div>
  );
}
