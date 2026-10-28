'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Check, ChevronRight, Landmark, Loader2, MessageSquare, Smartphone, type LucideIcon } from 'lucide-react';

import { OtpInput } from '@/components/auth/otp-input';
import { PhoneField } from '@/components/ui/phone-field';
import { useAuthStore } from '@/lib/auth/auth.store';
import {
  usePayoutMethods,
  useResendPayoutMethodOtp,
  useStartPayoutMethodVerification,
  useVerifyPayoutMethodOtp,
} from '@/lib/hooks/use-payouts';
import type { AddPayoutMethodInput, PayoutMethodType } from '@/lib/api/wallet.api';
import { normaliseError, retryAfterSecondsOf } from '@/lib/api/client';
import { cn } from '@/lib/utils';

type MethodType = 'momo' | 'bank' | 'payoneer';

/** In-flight MoMo OTP challenge - masked number + id to confirm/resend against. */
interface OtpChallenge {
  challengeId: string;
  phone: string;
}

const OTP_LENGTH = 6;
/**
 * Only a fallback. The real wait escalates server-side - a minute for the
 * first resend, five for the ones after - and the server returns the figure,
 * so this is used only when a response somehow carries none. It was 30s, which
 * simply disagreed with the server and let the button go live while a resend
 * would still be refused.
 */
const RESEND_COOLDOWN_SECONDS = 60;

// Per-category caps (mirror the backend limits).
const MOMO_LIMIT = 3;
const BANK_LIMIT = 2;

const FIELD_CLASS =
  'h-12 w-full rounded-xl border border-hairline bg-surface px-3.5 text-[14px] text-ink outline-none transition placeholder:text-subtle focus:border-brand-border';

/** Momo provider select value → backend enum. Airtel falls back to MTN_MOMO. */
function resolveType(type: MethodType, momoProvider: string): PayoutMethodType {
  if (type === 'bank') return 'BANK';
  if (type === 'payoneer') return 'PAYONEER';
  return momoProvider === 'orange' ? 'ORANGE_MONEY' : 'MTN_MOMO';
}

const PROVIDER_LABEL: Record<string, string> = {
  mtn: 'MTN MoMo',
  orange: 'Orange Money',
  airtel: 'Airtel Money',
};

export default function AddPayoutMethodPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const startVerification = useStartPayoutMethodVerification();
  const { data: payoutMethods } = usePayoutMethods();
  const user = useAuthStore((state) => state.user);

  // Count existing methods per category to enforce the per-kind caps.
  const momoCount = payoutMethods?.filter((method) => method.kind === 'momo').length ?? 0;
  const bankCount = payoutMethods?.filter((method) => method.kind === 'bank').length ?? 0;
  const momoLimitReached = momoCount >= MOMO_LIMIT;
  const bankLimitReached = bankCount >= BANK_LIMIT;

  // When set, the number needs an SMS OTP - swap the form for the OTP step.
  const [otpChallenge, setOtpChallenge] = useState<OtpChallenge | null>(null);

  const [type, setType] = useState<MethodType>('momo');
  const [provider, setProvider] = useState('mtn');
  const [nickname, setNickname] = useState('');
  const [makeDefault, setMakeDefault] = useState(true);
  // Detail field varies by type: phone (momo), account number (bank), email (Payoneer).
  const [phone, setPhone] = useState((user?.phone ?? '').replace(/\s/g, ''));
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');

  // Payout name must match the verified identity - shown read-only, not entered.
  const accountName = user?.fullName ?? '';

  // Payoneer is intentionally not offered in the UI (only MoMo + bank).
  const methodTypes: { value: MethodType; icon: LucideIcon; tile: string; title: string; sub: string; disabled: boolean }[] = [
    { value: 'momo', icon: Smartphone, tile: 'bg-warning-bg text-warning-text', title: t('settings.payouts.typeMomo'), sub: t('settings.payouts.typeMomoSub'), disabled: momoLimitReached },
    { value: 'bank', icon: Landmark, tile: 'bg-brand-50 text-brand-600', title: t('settings.payouts.typeBank'), sub: t('settings.payouts.typeBankSub'), disabled: bankLimitReached },
  ];

  // If the currently selected category is at its limit, move to an available one.
  useEffect(() => {
    if (type === 'momo' && momoLimitReached && !bankLimitReached) setType('bank');
    else if (type === 'bank' && bankLimitReached && !momoLimitReached) setType('momo');
  }, [type, momoLimitReached, bankLimitReached]);

  const steps = [t('settings.payouts.next1'), t('settings.payouts.next2'), t('settings.payouts.next3')];

  const accountDetail = (type === 'momo' ? phone : type === 'bank' ? accountNumber : email).trim();
  // Provider carries the momo network (momo) or the bank name (bank).
  const providerLabel =
    type === 'momo' ? PROVIDER_LABEL[provider] : type === 'bank' ? bankName.trim() || undefined : undefined;
  const detailValid =
    type === 'payoneer' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountDetail) : accountDetail.length >= 3;
  // MoMo has no account-name field - the backend fills it from the verified name.
  const nameValid = type === 'momo' || accountName.trim().length >= 2;
  const selectedLimitReached =
    (type === 'momo' && momoLimitReached) || (type === 'bank' && bankLimitReached);
  const valid =
    nameValid && detailValid && (type !== 'bank' || bankName.trim().length >= 2) && !selectedLimitReached;

  async function save() {
    if (!valid || startVerification.isPending) return;
    const input: AddPayoutMethodInput = {
      type: resolveType(type, provider),
      accountDetail,
      provider: providerLabel,
      country: user?.country ?? undefined,
      makeDefault,
    };
    // Only bank/Payoneer send the account name; MoMo is auto-filled server-side.
    if (type !== 'momo') input.accountName = accountName.trim();
    try {
      const result = await startVerification.mutateAsync(input);
      if (result.requiresOtp === false) {
        // Bank / Payoneer - created immediately, no OTP needed.
        toast.success(t('settings.payouts.added'));
        router.push('/settings/payouts');
        return;
      }
      // MoMo - a code was texted to the number; move to the OTP step.
      setOtpChallenge({ challengeId: result.challengeId, phone: result.phone });
    } catch (error) {
      toast.error(normaliseError(error).message || t('settings.payouts.actionError'));
    }
  }

  if (otpChallenge) {
    return (
      <OtpStep
        challenge={otpChallenge}
        onCancel={() => setOtpChallenge(null)}
        onVerified={() => {
          toast.success(t('settings.payouts.added'));
          router.push('/settings/payouts');
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4">
      {/* Full-width header band */}
      <div className="-mx-4 -mt-4 border-b border-hairline bg-surface px-4 pb-4 pt-5 md:mx-0 md:mt-0 md:rounded-2xl md:border md:px-6 md:pt-6">
        <h1 className="text-xl font-extrabold text-ink">{t('settings.payouts.addTitle')}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t('settings.payouts.addSubtitle')}</p>
      </div>

      {/* Method type */}
      <div>
        <p className="mb-2 text-[12.5px] font-semibold text-body">{t('settings.payouts.methodType')}</p>
        <div className="space-y-2.5">
          {methodTypes.map((option) => {
            const selected = type === option.value;
            const OptionIcon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => !option.disabled && setType(option.value)}
                disabled={option.disabled}
                aria-disabled={option.disabled}
                className={cn(
                  'shadow-card flex w-full items-center gap-3 rounded-2xl border bg-surface p-4 text-left transition',
                  option.disabled
                    ? 'cursor-not-allowed border-hairline opacity-55'
                    : selected
                      ? 'border-brand-500'
                      : 'border-hairline hover:border-brand-border',
                )}
              >
                <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', option.tile)}>
                  <OptionIcon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold text-ink">{option.title}</span>
                  <span className="block text-[12.5px] text-muted-foreground">
                    {option.disabled ? t('settings.payouts.limitReached') : option.sub}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-subtle" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Details */}
      <div className="space-y-4">
        <p className="text-[12.5px] font-semibold text-body">{t('settings.payouts.details')}</p>

        {type === 'momo' ? (
          <>
            {/* Mobile-money provider + phone */}
            <Field label={t('settings.payouts.provider')}>
              <div className="relative">
                <select
                  className={cn(FIELD_CLASS, 'appearance-none pr-10')}
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                >
                  <option value="mtn">MTN MoMo</option>
                  <option value="orange">Orange Money</option>
                  <option value="airtel">Airtel Money</option>
                </select>
                <ChevronRight className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-subtle" />
              </div>
            </Field>
            <Field label={t('settings.payouts.phone')}>
              <PhoneField value={phone} onChange={setPhone} />
            </Field>
          </>
        ) : type === 'bank' ? (
          <>
            {/* Bank name + account number */}
            <Field label={t('settings.payouts.bankName')}>
              <input
                className={FIELD_CLASS}
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                placeholder={t('settings.payouts.bankNamePlaceholder')}
              />
            </Field>
            <Field label={t('settings.payouts.accountNumber')}>
              <input
                className={FIELD_CLASS}
                inputMode="numeric"
                value={accountNumber}
                onChange={(event) => setAccountNumber(event.target.value.replace(/[^\d]/g, ''))}
                placeholder={t('settings.payouts.accountNumberPlaceholder')}
              />
            </Field>
          </>
        ) : (
          /* Payoneer email */
          <Field label={t('settings.payouts.email')}>
            <input
              className={FIELD_CLASS}
              type="email"
              autoCapitalize="none"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('settings.payouts.emailPlaceholder')}
            />
          </Field>
        )}

        {/* Account name - matches verified identity. MoMo auto-fills it server-side. */}
        {type !== 'momo' ? (
          <Field label={t('settings.payouts.accountName')}>
            <div className="flex h-12 items-center justify-between rounded-xl border border-positive/40 bg-positive-bg/40 px-3.5">
              <span className="text-[14px] font-bold uppercase text-positive-text">{accountName}</span>
              <Check className="size-4 text-positive-text" strokeWidth={3} />
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[11.5px] font-semibold text-positive-text">
              {t('settings.payouts.matchesVerified')}
            </p>
          </Field>
        ) : null}

        {/* Nickname */}
        <Field label={t('settings.payouts.nickname')}>
          <input
            className={FIELD_CLASS}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder={t('settings.payouts.nicknamePlaceholder')}
          />
        </Field>

        {/* Default toggle */}
        <div className="shadow-card flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-4 py-3.5">
          <button
            type="button"
            role="switch"
            aria-checked={makeDefault}
            onClick={() => setMakeDefault((value) => !value)}
            className={cn('relative h-6 w-11 shrink-0 rounded-full transition', makeDefault ? 'bg-brand-500' : 'bg-field')}
          >
            <span
              className={cn(
                'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all',
                makeDefault ? 'left-[22px]' : 'left-0.5',
              )}
            />
          </button>
          <span className="text-[14px] font-bold text-ink">{t('settings.payouts.useDefault')}</span>
        </div>

        {/* What happens next */}
        <div className="rounded-2xl bg-brand-50/60 p-4">
          <p className="text-[13px] font-bold text-brand-700">{t('settings.payouts.whatNext')}</p>
          <ol className="mt-2.5 space-y-2.5">
            {steps.map((stepText, index) => (
              <li key={index} className="flex gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                  {index + 1}
                </span>
                <span className="text-[12.5px] leading-relaxed text-brand-700">{stepText}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={save}
        disabled={!valid || startVerification.isPending}
        className="bg-primary shadow-brand flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14.5px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
      >
        {startVerification.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {t('settings.payouts.addVerify')}
      </button>
    </div>
  );
}

/**
 * SMS-OTP step for MoMo numbers - enter the 6-digit code, verify (creates the
 * method) or resend after a short cooldown. Cancelling returns to the form.
 */
function OtpStep({
  challenge,
  onVerified,
  onCancel,
}: {
  challenge: OtpChallenge;
  onVerified: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const verifyOtp = useVerifyPayoutMethodOtp();
  const resendOtp = useResendPayoutMethodOtp();

  const [challengeId, setChallengeId] = useState(challenge.challengeId);
  const [phone, setPhone] = useState(challenge.phone);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    const timer = setInterval(() => setCooldown((value) => (value > 0 ? value - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function verify() {
    if (code.length < OTP_LENGTH || verifyOtp.isPending) return;
    try {
      await verifyOtp.mutateAsync({ challengeId, code });
      onVerified();
    } catch (error) {
      toast.error(normaliseError(error).message || t('settings.payouts.actionError'));
      setCode('');
    }
  }

  async function resend() {
    if (cooldown > 0 || resendOtp.isPending) return;
    try {
      const result = await resendOtp.mutateAsync(challengeId);
      setChallengeId(result.challengeId);
      setPhone(result.phone);
      setCode('');
      // The server says when the next one may go; trust it over any local guess.
      setCooldown(result.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS);
      toast(t('settings.payouts.otpResent'));
    } catch (error) {
      // A refusal carries the remaining wait, so restart the countdown at the
      // real figure rather than leaving the button live and failing again.
      const waitFromError = retryAfterSecondsOf(error);
      if (waitFromError) setCooldown(Math.ceil(waitFromError));
      toast.error(normaliseError(error).message || t('settings.payouts.actionError'));
    }
  }

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4">
      {/* Full-width header band */}
      <div className="-mx-4 -mt-4 border-b border-hairline bg-surface px-4 pb-4 pt-5 md:mx-0 md:mt-0 md:rounded-2xl md:border md:px-6 md:pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="mb-3 flex w-fit items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          {t('auth.back')}
        </button>
        <h1 className="text-xl font-extrabold text-ink">{t('settings.payouts.otpTitle')}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t('settings.payouts.otpSubtitle', { phone })}
        </p>
      </div>

      {/* Code entry */}
      <div className="shadow-card rounded-2xl border border-hairline bg-surface p-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-warning-bg text-warning-text">
          <MessageSquare className="size-5" />
        </span>
        <p className="mt-4 text-[13px] text-muted-foreground">{t('settings.payouts.otpHint')}</p>

        <div className="mt-5">
          <OtpInput value={code} onChange={setCode} length={OTP_LENGTH} autoFocus />
        </div>

        <button
          type="button"
          onClick={verify}
          disabled={code.length < OTP_LENGTH || verifyOtp.isPending}
          className="bg-primary shadow-brand mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14.5px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {verifyOtp.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {t('auth.verify.cta')}
        </button>

        <div className="mt-3 text-[13px]">
          {cooldown > 0 ? (
            <span className="text-muted-foreground">
              {t('settings.payouts.otpResendIn', { seconds: cooldown })}
            </span>
          ) : (
            <button
              type="button"
              onClick={resend}
              disabled={resendOtp.isPending}
              className="font-semibold text-brand-600 transition hover:text-brand-700 disabled:opacity-60"
            >
              {t('auth.verify.resend')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-[12.5px] font-semibold text-body">{label}</label>
      {children}
    </div>
  );
}
