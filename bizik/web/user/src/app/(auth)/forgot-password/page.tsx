'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, KeyRound, Loader2, Lock, Send } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { PhoneField } from '@/components/ui/phone-field';
import { AuthVerify } from '@/components/auth/auth-verify';
import { PasswordStrength } from '@/components/auth/password-strength';
import { normaliseError } from '@/lib/api/client';
import { authApi } from '@/lib/auth/auth.api';
import { cn } from '@/lib/utils';
import { CODE_LENGTH } from '@/lib/auth/code-length';

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Add an uppercase letter')
      .regex(/[0-9]/, 'Add a number')
      .regex(/[^A-Za-z0-9]/, 'Add a symbol'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
type PasswordValues = z.infer<typeof passwordSchema>;

type Step = 'phone' | 'verify' | 'password';

/**
 * SRS FR-AUTH-006 - phone-OTP password reset wizard:
 *  1. Phone   → request a 6-digit SMS code (the backend always resolves).
 *  2. Verify  → exchange the code for a one-time reset token.
 *  3. Password→ set a new password with that token.
 * The standalone `?token` reset-link path lives in reset-password/page.tsx.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [pending, setPending] = useState(false);

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const password = passwordForm.watch('password');

  async function onRequestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phone.trim()) return;
    setPending(true);
    try {
      await authApi.forgotPassword(phone.trim());
    } catch {
      // Neutral by design - never reveal whether the number has an account.
    } finally {
      setPending(false);
      setCode('');
      setStep('verify');
    }
  }

  async function onVerifyCode() {
    if (code.trim().length < CODE_LENGTH) return;
    setPending(true);
    try {
      const { token } = await authApi.verifyResetOtp(phone.trim(), code.trim());
      setResetToken(token);
      setStep('password');
    } catch (error) {
      toast.error(t('auth.errors.verifyTitle'), { description: normaliseError(error).message });
      setCode('');
    } finally {
      setPending(false);
    }
  }

  async function onResendCode() {
    // Deliberately NOT swallowed any more. This endpoint stays neutral about
    // whether the number has an account - the server guarantees that by
    // claiming the cooldown before it looks the account up - so the wait it
    // reports is safe to show, and showing it is the whole point.
    const result = await authApi.forgotPassword(phone.trim());
    return { retryAfterSeconds: result?.retryAfterSeconds };
  }

  async function onSetPassword(values: PasswordValues) {
    setPending(true);
    try {
      await authApi.resetPassword(resetToken, values.password);
      toast.success(t('auth.resetPassword.updatedTitle'), {
        description: t('auth.resetPassword.updatedToast'),
      });
      router.replace('/login');
    } catch (error) {
      toast.error(normaliseError(error).message);
    } finally {
      setPending(false);
    }
  }

  // ── Verify step ───────────────────────────────────────────────────────────
  if (step === 'verify') {
    return (
      <AuthVerify
        code={code}
        setCode={setCode}
        onSubmit={onVerifyCode}
        pending={pending}
        length={CODE_LENGTH}
        onResend={onResendCode}
        onBack={() => {
          setCode('');
          setStep('phone');
        }}
        subtitle={
          <>
            {t('auth.verify.sentSms')} <span className="font-bold text-ink">{phone.trim()}</span>
          </>
        }
      />
    );
  }

  // ── New password step ─────────────────────────────────────────────────────
  if (step === 'password') {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <button
          type="button"
          onClick={() => setStep('verify')}
          className="flex w-fit items-center gap-1.5 text-[14px] font-semibold text-white/90 transition hover:text-white lg:text-muted-foreground lg:hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          {t('auth.back')}
        </button>

        <div>
          <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.5px] text-white lg:text-ink">
            {t('auth.resetPassword.title')}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-white/85 lg:text-muted-foreground">
            {t('auth.resetPassword.subtitle')}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-[0_24px_60px_-20px_rgba(11,31,58,0.5)] lg:border lg:border-hairline lg:shadow-sm">
          <form onSubmit={passwordForm.handleSubmit(onSetPassword)} className="grid gap-4">
            <div className="grid gap-2.5">
              <Field
                label={t('auth.resetPassword.newPasswordLabel')}
                type="password"
                autoComplete="new-password"
                placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
                icon={<Lock />}
                error={passwordForm.formState.errors.password?.message}
                {...passwordForm.register('password')}
              />
              <PasswordStrength password={password} />
            </div>
            <Field
              label={t('auth.resetPassword.confirmLabel')}
              type="password"
              autoComplete="new-password"
              placeholder={t('auth.resetPassword.confirmPlaceholder')}
              icon={<Lock />}
              error={passwordForm.formState.errors.confirm?.message}
              {...passwordForm.register('confirm')}
            />
            <button
              type="submit"
              disabled={pending}
              className={cn(
                'mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition',
                pending
                  ? 'cursor-not-allowed bg-field text-white'
                  : 'bg-primary text-white shadow-brand hover:opacity-95',
              )}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t('auth.resetPassword.updatePassword')
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Phone step ────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Link
        href="/login"
        className="flex w-fit items-center gap-1.5 text-[14px] font-semibold text-white/90 transition hover:text-white lg:text-muted-foreground lg:hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        {t('auth.back')}
      </Link>

      <div>
        <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.5px] text-white lg:text-ink">
          {t('auth.forgotPassword.title')}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-white/85 lg:text-muted-foreground">
          {t('auth.forgotPassword.subtitle')}
        </p>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-[0_24px_60px_-20px_rgba(11,31,58,0.5)] lg:border lg:border-hairline lg:shadow-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <KeyRound className="size-5" />
        </span>
        <form onSubmit={onRequestCode} className="mt-5 grid gap-4">
          <PhoneField
            label={t('auth.forgotPassword.phoneLabel')}
            value={phone}
            onChange={setPhone}
          />
          <button
            type="submit"
            disabled={pending || !phone.trim()}
            className={cn(
              'flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition',
              pending || !phone.trim()
                ? 'cursor-not-allowed bg-field text-white'
                : 'bg-primary text-white shadow-brand hover:opacity-95',
            )}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-4" />
                {t('auth.forgotPassword.sendCode')}
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-[13.5px] text-muted-foreground">
          <Link href="/login" className="font-bold text-brand-600 hover:text-brand-700">
            {t('auth.forgotPassword.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
