'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { PhoneField } from '@/components/ui/phone-field';
import { AuthVerify } from '@/components/auth/auth-verify';
import { normaliseError } from '@/lib/api/client';
import { CODE_LENGTH } from '@/lib/auth/code-length';
import { authApi } from '@/lib/auth/auth.api';
import { useAuthStore } from '@/lib/auth/auth.store';
import { cn } from '@/lib/utils';

const credentialsSchema = z.object({
  phone: z.string().min(6, 'Enter your phone number'),
  password: z.string().min(1, 'Enter your password'),
});
type Credentials = z.infer<typeof credentialsSchema>;

type Step =
  | { kind: 'credentials' }
  | { kind: '2fa'; challengeId: string }
  // `waitSeconds` is the server's own figure for when another code may be
  // asked for, carried through so the countdown on the next screen matches
  // what the server will actually allow.
  | { kind: 'verify-phone'; phone: string; waitSeconds?: number; codeSent?: boolean };

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const login = useAuthStore((s) => s.login);
  const verifyTwoFactor = useAuthStore((s) => s.verifyTwoFactor);
  const verifyPhoneCode = useAuthStore((s) => s.verifyPhoneCode);

  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);

  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { phone: '', password: '' },
  });

  async function onCredentials(values: Credentials) {
    setPending(true);
    try {
      const res = await login(values);
      if (res.tokens) return router.replace('/dashboard');
      if (res.twoFactorRequired && res.challengeId)
        return setStep({ kind: '2fa', challengeId: res.challengeId });
      if (res.verificationRequired)
        return setStep({
          kind: 'verify-phone',
          phone: res.phone ?? values.phone,
          waitSeconds: res.retryAfterSeconds,
          codeSent: res.codeSent,
        });
      toast.error(t('auth.errors.signInTitle'), { description: t('auth.errors.unexpected') });
    } catch (err) {
      toast.error(t('auth.errors.signInTitle'), { description: normaliseError(err).message });
    } finally {
      setPending(false);
    }
  }

  async function onCode() {
    if (step.kind === 'credentials') return;
    // Every code this app asks for is six digits - the phone code, the reset
    // code and the TOTP code alike. A screen that expects four silently makes
    // verification impossible, because the box cannot hold the code that was
    // sent.
    if (code.trim().length < CODE_LENGTH) return;
    setPending(true);
    try {
      if (step.kind === '2fa') await verifyTwoFactor(step.challengeId, code.trim());
      else await verifyPhoneCode(step.phone, code.trim());
      router.replace('/dashboard');
    } catch (err) {
      toast.error(t('auth.errors.verifyTitle'), { description: normaliseError(err).message });
      setCode('');
    } finally {
      setPending(false);
    }
  }

  // ── Verification step ──────────────────────────────────────────────────────
  if (step.kind !== 'credentials') {
    return (
      <AuthVerify
        code={code}
        setCode={setCode}
        onSubmit={onCode}
        pending={pending}
        length={CODE_LENGTH}
        showResend={step.kind === 'verify-phone'}
        waitSeconds={step.kind === 'verify-phone' ? step.waitSeconds : undefined}
        codeSent={step.kind === 'verify-phone' ? step.codeSent : undefined}
        // This was missing entirely: the resend button reset its own timer,
        // showed a "code sent" toast and called nothing at all.
        onResend={
          step.kind === 'verify-phone'
            ? () => authApi.resendCode(step.phone)
            : undefined
        }
        onBack={() => {
          setCode('');
          setStep({ kind: 'credentials' });
        }}
        subtitle={
          step.kind === '2fa' ? (
            t('auth.verify.twoFactor')
          ) : (
            <>
              {t('auth.verify.sentSms')} <span className="font-bold text-ink">{step.phone}</span>
            </>
          )
        }
      />
    );
  }

  // ── Credentials step ──────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {/* Mobile: brand hero (no brand panel on small screens). */}
      <div className="lg:hidden">
        <h1 className="text-[32px] font-extrabold leading-[1.08] tracking-[-0.5px] text-white">
          {t('auth.heroTitle')}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-white/85">{t('auth.heroSubtitle')}</p>
      </div>
      {/* Desktop: compact page heading (the brand panel carries the hero). */}
      <div className="hidden lg:block">
        <h1 className="text-[28px] font-extrabold tracking-[-0.5px] text-ink">{t('auth.login')}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{t('auth.loginSubtitle')}</p>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-[0_24px_60px_-20px_rgba(11,31,58,0.5)] lg:border lg:border-hairline lg:shadow-sm">
        <form onSubmit={form.handleSubmit(onCredentials)} className="grid gap-4">
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
          <div className="grid gap-1.5">
            <Field
              label={t('auth.password')}
              type="password"
              autoComplete="current-password"
              placeholder={t('auth.passwordPlaceholder')}
              icon={<Lock />}
              error={form.formState.errors.password?.message}
              {...form.register('password')}
            />
            <Link
              href="/forgot-password"
              className="justify-self-end text-[13px] font-semibold text-brand-600 hover:text-brand-700"
            >
              {t('auth.forgot')}
            </Link>
          </div>
          <button
            type="submit"
            disabled={pending}
            className={cn(
              'mt-1 flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold transition',
              'bg-primary text-white shadow-brand hover:opacity-95 disabled:opacity-70',
            )}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : t('auth.login')}
          </button>
        </form>

        <p className="mt-6 text-center text-[13.5px] text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <Link href="/register" className="font-bold text-brand-600 hover:text-brand-700">
            {t('auth.createAccount')}
          </Link>
        </p>
      </div>
    </div>
  );
}
