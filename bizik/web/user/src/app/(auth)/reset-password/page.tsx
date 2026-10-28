'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Loader2, Lock, LockOpen } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { normaliseError } from '@/lib/api/client';
import { authApi } from '@/lib/auth/auth.api';
import { cn } from '@/lib/utils';

/** SRS FR-AUTH-006 - set a new password from a texted reset-link token. */
function ResetPasswordForm() {
  const router = useRouter();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const tooShort = password.length > 0 && password.length < 8;
  const canSubmit = password.length >= 8 && confirm === password && !!token;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canSubmit) return;
    setPending(true);
    try {
      await authApi.resetPassword(token, password);
      toast.success(t('auth.resetPassword.updatedTitle'), {
        description: t('auth.resetPassword.updatedToast'),
      });
      router.push('/login');
    } catch (error) {
      toast.error(normaliseError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Link
        href="/login"
        className="flex w-fit items-center gap-1.5 text-[14px] font-semibold text-white/90 transition hover:text-white lg:text-muted-foreground lg:hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        {t('auth.back')}
      </Link>

      <div>
        <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.5px] text-white lg:text-ink">
          {t('auth.resetPassword.title')}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-white/85 lg:text-muted-foreground">
          {t('auth.resetPassword.subtitle')}
        </p>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-[0_24px_60px_-20px_rgba(11,31,58,0.5)] lg:border lg:border-hairline lg:shadow-sm">
        {!token ? (
          <div className="grid justify-items-center gap-3 py-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-negative/10 text-negative">
              <Lock className="size-5" />
            </span>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              {t('auth.resetPassword.invalidLink')}
            </p>
            <Link
              href="/forgot-password"
              className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-white shadow-brand transition hover:opacity-95"
            >
              {t('auth.resetPassword.requestNewLink')}
            </Link>
          </div>
        ) : (
          <>
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <LockOpen className="size-5" />
            </span>
            <form onSubmit={onSubmit} className="mt-5 grid gap-4">
              <Field
                label={t('auth.resetPassword.newPasswordLabel')}
                type="password"
                autoComplete="new-password"
                placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
                icon={<Lock />}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={tooShort ? t('auth.resetPassword.tooShort') : undefined}
              />
              <Field
                label={t('auth.resetPassword.confirmLabel')}
                type="password"
                autoComplete="new-password"
                placeholder={t('auth.resetPassword.confirmPlaceholder')}
                icon={<Lock />}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                error={mismatch ? t('auth.resetPassword.mismatch') : undefined}
              />
              <button
                type="submit"
                disabled={pending || !canSubmit}
                className={cn(
                  'mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition',
                  pending || !canSubmit
                    ? 'cursor-not-allowed bg-field text-white'
                    : 'bg-primary text-white shadow-brand hover:opacity-95',
                )}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="size-4" />
                    {t('auth.resetPassword.updatePassword')}
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-[13.5px] text-muted-foreground">
              <Link href="/login" className="font-bold text-brand-600 hover:text-brand-700">
                {t('auth.resetPassword.backToLogin')}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10 text-white/80 lg:text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
