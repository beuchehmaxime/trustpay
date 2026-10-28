'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Lock, User } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { PhoneField } from '@/components/ui/phone-field';
import { AuthVerify } from '@/components/auth/auth-verify';
import { PasswordStrength } from '@/components/auth/password-strength';
import { normaliseError } from '@/lib/api/client';
import { CODE_LENGTH } from '@/lib/auth/code-length';
import { authApi } from '@/lib/auth/auth.api';
import { useAuthStore } from '@/lib/auth/auth.store';
import { cn } from '@/lib/utils';

const schema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  /** Honeypot - see the hidden field below. Never shown, never validated. */
  website: z.string().optional(),
  phone: z.string().min(6, 'Enter your phone number'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Add an uppercase letter')
    .regex(/[0-9]/, 'Add a number')
    .regex(/[^A-Za-z0-9]/, 'Add a symbol'),
});
type Values = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const register = useAuthStore((s) => s.register);
  const verifyPhoneCode = useAuthStore((s) => s.verifyPhoneCode);

  const [verifyPhone, setVerifyPhone] = useState<string | null>(null);
  const [verifyWait, setVerifyWait] = useState<number | undefined>(undefined);
  const [verifyCodeSent, setVerifyCodeSent] = useState<boolean | undefined>(undefined);
  const [code, setCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', password: '', website: '' },
  });
  const password = form.watch('password');

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      const res = await register({
        fullName: values.fullName.trim(),
        phone: values.phone.trim(),
        password: values.password,
        website: values.website,
      });
      if (res.tokens) return router.replace('/dashboard');
      setVerifyPhone(res.phone ?? values.phone);
      // The server's own wait, so the resend countdown agrees with it.
      setVerifyWait(res.retryAfterSeconds);
      setVerifyCodeSent(res.codeSent);
    } catch (err) {
      toast.error(t('auth.errors.createTitle'), { description: normaliseError(err).message });
    } finally {
      setPending(false);
    }
  }

  async function onCode() {
    if (!verifyPhone || code.trim().length < CODE_LENGTH) return;
    setPending(true);
    try {
      await verifyPhoneCode(verifyPhone, code.trim());
      router.replace('/dashboard');
    } catch (err) {
      toast.error(t('auth.errors.verifyTitle'), { description: normaliseError(err).message });
      setCode('');
    } finally {
      setPending(false);
    }
  }

  // ── Phone verification step ───────────────────────────────────────────────
  if (verifyPhone) {
    return (
      <AuthVerify
        code={code}
        setCode={setCode}
        onSubmit={onCode}
        pending={pending}
        length={CODE_LENGTH}
        waitSeconds={verifyWait}
        codeSent={verifyCodeSent}
        onResend={() => authApi.resendCode(verifyPhone)}
        onBack={() => {
          setCode('');
          setVerifyPhone(null);
        }}
        subtitle={
          <>
            {t('auth.verify.sentSms')} <span className="font-bold text-ink">{verifyPhone}</span>
          </>
        }
      />
    );
  }

  // ── Sign-up step ──────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.5px] text-white lg:text-ink">
          {t('auth.register.title')}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-white/85 lg:text-muted-foreground">
          {t('auth.register.subtitle')}
        </p>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-[0_24px_60px_-20px_rgba(11,31,58,0.5)] lg:border lg:border-hairline lg:shadow-sm">
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          {/*
            Honeypot. Off-screen rather than display:none (some bots skip hidden
            inputs), out of the tab order, and hidden from screen readers, so no
            person can reach it. A filled value means the submission is scripted.
          */}
          <input
            {...form.register('website')}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />
          <Field
            label={t('auth.register.fullName')}
            autoComplete="name"
            placeholder={t('auth.register.fullNamePlaceholder')}
            icon={<User />}
            error={form.formState.errors.fullName?.message}
            {...form.register('fullName')}
          />

          <div className="grid gap-1.5">
            <Controller
              control={form.control}
              name="phone"
              render={({ field, fieldState }) => (
                <PhoneField
                  label={t('auth.phone')}
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
            <p className="text-[11.5px] text-muted-foreground">{t('auth.register.phoneHint')}</p>
          </div>

          <div className="grid gap-2.5">
            <Field
              label={t('auth.password')}
              type="password"
              autoComplete="new-password"
              placeholder={t('auth.register.passwordPlaceholder')}
              icon={<Lock />}
              {...form.register('password')}
            />
            <PasswordStrength password={password} />
          </div>

          {/* Terms */}
          <button
            type="button"
            onClick={() => setAgreed((value) => !value)}
            className="flex items-center gap-2.5 text-left"
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition',
                agreed ? 'border-brand-500 bg-brand-500 text-white' : 'border-field',
              )}
            >
              {agreed ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </span>
            <span className="text-[13px] text-body">
              {t('auth.register.agreePrefix')}{' '}
              <Link href="/terms-of-service" className="font-semibold text-brand-600" onClick={(event) => event.stopPropagation()}>
                {t('auth.register.terms')}
              </Link>{' '}
              {t('auth.register.and')}{' '}
              <Link href="/privacy-policy" className="font-semibold text-brand-600" onClick={(event) => event.stopPropagation()}>
                {t('auth.register.privacy')}
              </Link>
            </span>
          </button>

          <button
            type="submit"
            disabled={pending || !agreed}
            className={cn(
              'mt-1 flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold transition',
              pending || !agreed
                ? 'cursor-not-allowed bg-field text-white'
                : 'bg-primary text-white shadow-brand hover:opacity-95',
            )}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : t('auth.register.cta')}
          </button>
        </form>

        <p className="mt-6 text-center text-[13.5px] text-muted-foreground">
          {t('auth.haveAccount')}{' '}
          <Link href="/login" className="font-bold text-brand-600 hover:text-brand-700">
            {t('auth.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
