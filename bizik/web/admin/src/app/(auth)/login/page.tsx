'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { normaliseError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth.store';
import { firstAccessibleRoute } from '@/lib/auth/landing';

const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type Credentials = z.infer<typeof credentialsSchema>;

type Step =
  | { kind: 'credentials' }
  | { kind: '2fa'; challengeId: string }
  | { kind: 'mfa'; challengeId: string; email?: string };

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const verifyTwoFactor = useAuthStore((state) => state.verifyTwoFactor);
  const verifyMfa = useAuthStore((state) => state.verifyMfa);
  const resendMfa = useAuthStore((state) => state.resendMfa);
  const logout = useAuthStore((state) => state.logout);

  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [remember, setRemember] = useState(true);

  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  });

  /** Only platform operators (an assigned RBAC role) may enter the console. */
  async function gateAndEnter() {
    const user = useAuthStore.getState().user;
    if (!user?.isOperator) {
      await logout();
      setStep({ kind: 'credentials' });
      setCode('');
      toast.error('Access denied', {
        description: 'This account is not authorized for the admin console.',
      });
      return;
    }
    // Land on the first section this operator is allowed to see.
    router.replace(firstAccessibleRoute(user));
  }

  async function onCredentials(values: Credentials) {
    setPending(true);
    try {
      const res = await login(values);
      if (res.tokens) return gateAndEnter();
      if (res.mfaRequired && res.challengeId)
        return setStep({ kind: 'mfa', challengeId: res.challengeId, email: res.email });
      if (res.twoFactorRequired && res.challengeId)
        return setStep({ kind: '2fa', challengeId: res.challengeId });
      if (res.emailVerificationRequired) {
        toast.error('Verify your email', {
          description: 'This account still needs email verification.',
        });
        return;
      }
      toast.error('Could not sign in', {
        description: 'Unexpected response from the server. Please try again.',
      });
    } catch (err) {
      toast.error('Could not sign in', { description: normaliseError(err).message });
    } finally {
      setPending(false);
    }
  }

  async function onCode() {
    if (step.kind === 'credentials' || code.trim().length < 6) return;
    setPending(true);
    try {
      if (step.kind === 'mfa') await verifyMfa(step.challengeId, code.trim());
      else await verifyTwoFactor(step.challengeId, code.trim());
      await gateAndEnter();
    } catch (err) {
      toast.error('Verification failed', { description: normaliseError(err).message });
      setCode('');
    } finally {
      setPending(false);
    }
  }

  async function onResend() {
    if (step.kind !== 'mfa') return;
    try {
      await resendMfa(step.challengeId);
      toast.success('Code resent', { description: 'Check your email for a new code.' });
    } catch (err) {
      toast.error('Could not resend', { description: normaliseError(err).message });
    }
  }

  // ── Verification step (email MFA / authenticator 2FA) ─────────────────────
  if (step.kind !== 'credentials') {
    const isMfa = step.kind === 'mfa';
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setCode('');
            setStep({ kind: 'credentials' });
          }}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back
        </button>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          {isMfa ? 'Check your email' : 'Two-factor code'}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isMfa
            ? `For your security, we sent a 6-digit sign-in code to ${step.email ?? 'your email'}.`
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
        <div className="mt-8 grid gap-4">
          <Field
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
          />
          <Button
            size="lg"
            className="h-12 rounded-lg text-[15px]"
            onClick={onCode}
            disabled={pending}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : 'Verify & continue'}
          </Button>
          {isMfa ? (
            <button
              type="button"
              onClick={onResend}
              disabled={pending}
              className="text-center text-sm text-muted-foreground hover:text-ink"
            >
              Didn’t get it?{' '}
              <span className="font-semibold text-brand-600">Resend code</span>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Credentials step ──────────────────────────────────────────────────────
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
        <ShieldCheck className="size-3.5" /> Secure area
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink">Welcome back 👋</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Good to have you back. Sign in to continue to the BiZik admin console.
        This area is restricted to compliance &amp; operations staff.
      </p>

      <form onSubmit={form.handleSubmit(onCredentials)} className="mt-8 grid gap-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@bizik.cm"
          icon={<Mail />}
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          icon={<Lock />}
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />

        <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-muted-foreground select-none">
          <span className="relative flex size-[18px] items-center justify-center">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="peer size-[18px] cursor-pointer appearance-none rounded-md border border-field bg-white outline-none transition checked:border-brand-500 checked:bg-brand-500 focus-visible:ring-4 focus-visible:ring-brand-500/15"
            />
            <Check
              className="pointer-events-none absolute size-3 text-white opacity-0 peer-checked:opacity-100"
              strokeWidth={3}
            />
          </span>
          Keep me signed in
        </label>

        <Button
          type="submit"
          size="lg"
          className="mt-1 h-12 rounded-lg text-[15px]"
          disabled={pending}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
