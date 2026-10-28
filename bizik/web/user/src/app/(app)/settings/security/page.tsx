'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Fingerprint, Loader2, Lock, MessageCircle, Smartphone, Unlock } from 'lucide-react';
import { toast } from 'sonner';

import { normaliseError } from '@/lib/api/client';
import type { SessionInfo } from '@/lib/auth/auth.api';
import { useAuthStore } from '@/lib/auth/auth.store';
import {
  useChangePassword,
  useDisableTwoFactor,
  useEnableTwoFactor,
  useRevokeSession,
  useSetupTwoFactor,
  useSessions,
} from '@/lib/hooks/use-account';
import {
  useWhatsAppChannel,
  useWhatsAppChannelAction,
  type WhatsAppChannelStatus,
} from '@/lib/hooks/use-whatsapp-channel';
import { cn } from '@/lib/utils';

const PW_FIELD =
  'h-11 w-full rounded-xl border border-hairline bg-surface px-3.5 text-[14px] text-ink outline-none transition placeholder:text-subtle focus:border-brand-border';

/** Turn a user-agent string into a short, human device/browser label. */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (/iphone/i.test(userAgent)) return 'iPhone';
  if (/ipad/i.test(userAgent)) return 'iPad';
  if (/android/i.test(userAgent)) return 'Android';
  if (/okhttp|expo/i.test(userAgent)) return 'Mobile app';
  if (/edg/i.test(userAgent)) return 'Edge';
  if (/chrome|chromium/i.test(userAgent)) return 'Chrome';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/safari/i.test(userAgent)) return 'Safari';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/mac/i.test(userAgent)) return 'Mac';
  return 'Web browser';
}

function sessionDetail(session: SessionInfo): string {
  const when = new Date(session.createdAt);
  const date = Number.isNaN(when.getTime()) ? '' : when.toLocaleDateString();
  return [session.ipAddress ?? undefined, date].filter(Boolean).join(' · ');
}

export default function SecurityPage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);

  const sessionsQuery = useSessions();
  const revokeSession = useRevokeSession();
  const changePassword = useChangePassword();
  const setupTwoFactor = useSetupTwoFactor();
  const enableTwoFactor = useEnableTwoFactor();
  const disableTwoFactor = useDisableTwoFactor();

  const twoFactorEnabled = user?.twoFactorEnabled ?? false;
  const twoFactorBusy =
    setupTwoFactor.isPending || enableTwoFactor.isPending || disableTwoFactor.isPending;

  // Inline change-password form.
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function closePasswordForm() {
    setPwOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error(t('settings.security.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('settings.security.passwordMismatch'));
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast.success(t('settings.security.passwordSaved'));
      closePasswordForm();
    } catch (error) {
      toast.error(normaliseError(error).message);
    }
  }

  function onRevoke(sessionId: string) {
    if (!window.confirm(t('settings.security.revokeConfirm'))) return;
    revokeSession.mutate(sessionId, {
      onSuccess: () => toast.success(t('settings.security.sessionRevoked')),
      onError: (error) => toast.error(normaliseError(error).message),
    });
  }

  async function onToggleTwoFactor() {
    if (twoFactorBusy) return;
    try {
      if (twoFactorEnabled) {
        const code = window.prompt(t('settings.security.twoFactorPromptDisable'))?.trim();
        if (!code) return;
        await disableTwoFactor.mutateAsync(code);
        toast.success(t('settings.security.twoFactorDisabled'));
      } else {
        const setup = await setupTwoFactor.mutateAsync();
        const code = window
          .prompt(t('settings.security.twoFactorSetupHint', { secret: setup.secret }))
          ?.trim();
        if (!code) return;
        await enableTwoFactor.mutateAsync(code);
        toast.success(t('settings.security.twoFactorEnabled'));
      }
    } catch (error) {
      toast.error(normaliseError(error).message);
    }
  }

  const twoFactorStatus = twoFactorEnabled
    ? t('settings.security.on')
    : t('settings.security.off');

  const passwordForm = pwOpen ? (
    <form onSubmit={submitPassword} className="mt-4 grid gap-3 rounded-xl border border-hairline bg-muted/30 p-4">
      <input
        type="password"
        autoComplete="current-password"
        placeholder={t('settings.security.currentPassword')}
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        className={PW_FIELD}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder={t('settings.security.newPassword')}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        className={PW_FIELD}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder={t('settings.security.confirmPassword')}
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        className={PW_FIELD}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={closePasswordForm}
          className="h-10 rounded-xl border border-hairline px-4 text-[13px] font-semibold text-ink transition hover:bg-muted"
        >
          {t('settings.security.cancel')}
        </button>
        <button
          type="submit"
          disabled={changePassword.isPending}
          className="bg-primary shadow-brand h-10 rounded-xl px-5 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {t('settings.security.passwordUpdate')}
        </button>
      </div>
    </form>
  ) : null;

  const sessionList = (
    <ul className="mt-3 divide-y divide-[#F1F5FA]">
      {sessionsQuery.isLoading ? (
        <li className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </li>
      ) : sessionsQuery.isError ? (
        <li className="py-6 text-center text-[12.5px] text-muted-foreground">
          {t('settings.security.sessionsError')}
        </li>
      ) : (sessionsQuery.data ?? []).length === 0 ? (
        <li className="py-6 text-center text-[12.5px] text-muted-foreground">
          {t('settings.security.noSessions')}
        </li>
      ) : (
        (sessionsQuery.data ?? []).map((session) => (
          <li key={session.id} className="flex items-center justify-between gap-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="size-2.5 rounded-full bg-positive" />
              <div>
                <p className="text-[13.5px] font-bold text-ink">{deviceLabel(session.userAgent)}</p>
                <p className="text-[11.5px] text-muted-foreground">{sessionDetail(session)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRevoke(session.id)}
              disabled={revokeSession.isPending}
              className="shrink-0 text-[12.5px] font-bold text-negative transition hover:opacity-80 disabled:opacity-50"
            >
              {t('settings.security.revoke')}
            </button>
          </li>
        ))
      )}
    </ul>
  );

  return (
    <>
      {/* ── Desktop: wide cards ── */}
      <div className="hidden space-y-4 md:block">
        <section className="shadow-card rounded-2xl border border-hairline bg-surface p-6">
          <h1 className="text-lg font-extrabold text-ink">{t('settings.security.title')}</h1>

          {/* Change password */}
          <div className="mt-5 flex items-center justify-between gap-4 border-b border-hairline pb-5">
            <div>
              <p className="text-[14px] font-bold text-ink">{t('settings.security.changePassword')}</p>
            </div>
            <button
              type="button"
              onClick={() => setPwOpen((open) => !open)}
              className="shrink-0 rounded-xl border border-hairline px-4 py-2.5 text-[13px] font-semibold text-brand-700 transition hover:border-brand-border hover:bg-brand-50"
            >
              {t('settings.security.changePassword')}
            </button>
          </div>
          {passwordForm}

          {/* Two-factor */}
          <div className="flex items-center justify-between gap-4 border-b border-hairline py-5">
            <div>
              <p className="text-[14px] font-bold text-ink">{t('settings.security.twoFactor')}</p>
              <p className="text-[12.5px] text-muted-foreground">{twoFactorStatus}</p>
            </div>
            <Toggle on={twoFactorEnabled} busy={twoFactorBusy} onToggle={onToggleTwoFactor} label={t('settings.security.twoFactor')} />
          </div>

          {/* Face ID / fingerprint - mobile only */}
          <div className="flex items-center justify-between gap-4 pt-5">
            <div>
              <p className="text-[14px] font-bold text-subtle">{t('settings.security.biometrics')}</p>
              <p className="text-[12.5px] text-muted-foreground">{t('settings.security.mobileOnly')}</p>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground">
              {t('settings.security.mobileOnly')}
            </span>
          </div>
        </section>

        <WhatsAppChannelCard />

        <section className="shadow-card rounded-2xl border border-hairline bg-surface p-6">
          <h2 className="text-sm font-bold text-ink">{t('settings.security.activeSessions')}</h2>
          {sessionList}
        </section>
      </div>

      {/* ── Mobile / PWA: single column ── */}
      <div className="mx-auto w-full max-w-[560px] space-y-4 md:hidden">
      {/* Full-width header band */}
      <div className="-mx-4 -mt-4 border-b border-hairline bg-surface px-4 pb-4 pt-5">
        <h1 className="text-xl font-extrabold text-ink">{t('settings.security.title')}</h1>
      </div>

      {/* Security options */}
      <div className="shadow-card divide-y divide-[#F1F5FA] overflow-hidden rounded-2xl border border-hairline bg-surface">
        {/* Change password */}
        <button
          type="button"
          onClick={() => setPwOpen((open) => !open)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted/40"
        >
          <IconTile icon={Lock} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-ink">{t('settings.security.changePassword')}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-subtle" />
        </button>

        {/* Two-factor authentication */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <IconTile icon={Smartphone} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-ink">{t('settings.security.twoFactor')}</span>
            <span className="block text-[12.5px] text-muted-foreground">{twoFactorStatus}</span>
          </span>
          <Toggle on={twoFactorEnabled} busy={twoFactorBusy} onToggle={onToggleTwoFactor} label={t('settings.security.twoFactor')} />
        </div>

        {/* Face ID / fingerprint - not available on the web app yet */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <IconTile icon={Fingerprint} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-ink">{t('settings.security.biometrics')}</span>
            <span className="block text-[12.5px] text-muted-foreground">{t('settings.security.comingSoon')}</span>
          </span>
          <span className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground">
            {t('settings.security.comingSoon')}
          </span>
        </div>
      </div>

      {passwordForm}

      <WhatsAppChannelCard />

      {/* Active sessions */}
      <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">{t('settings.security.activeSessions')}</h2>
        {sessionList}
      </section>
      </div>
    </>
  );
}

/**
 * WhatsApp channel controls. Replying LOCK in the chat freezes it; only this
 * screen can release that lock, which is the point - if the SIM is gone, the
 * chat must not be able to talk its way back in.
 */
function WhatsAppChannelCard() {
  const { t } = useTranslation();
  const channelQuery = useWhatsAppChannel();
  const action = useWhatsAppChannelAction();
  const channel: WhatsAppChannelStatus | undefined = channelQuery.data;

  if (channelQuery.isLoading) {
    return (
      <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
        <div className="flex justify-center py-4">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }
  if (!channel?.linked) return null;

  const run = (next: 'lock' | 'unlock' | 'resetPin' | { optIn: boolean }, successKey: string) =>
    action.mutate(next, {
      onSuccess: () => toast.success(t(successKey)),
      onError: (error) => toast.error(normaliseError(error).message),
    });

  return (
    <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
      <div className="flex items-start gap-3">
        <IconTile icon={MessageCircle} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">{t('settings.security.whatsapp.title')}</h2>
          <p className="text-[12.5px] text-muted-foreground">
            {channel.phone} ·{' '}
            {channel.locked
              ? t('settings.security.whatsapp.statusLocked')
              : t('settings.security.whatsapp.statusActive')}
          </p>
        </div>
      </div>

      {channel.locked ? (
        <p className="mt-3 rounded-xl bg-warning-bg-soft px-3 py-2.5 text-[12.5px] font-medium text-warning-text">
          {t('settings.security.whatsapp.lockedHelp')}
        </p>
      ) : channel.lockedOut ? (
        <p className="mt-3 rounded-xl bg-warning-bg-soft px-3 py-2.5 text-[12.5px] font-medium text-warning-text">
          {t('settings.security.whatsapp.lockedOutHelp')}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {channel.locked || channel.lockedOut ? (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => run('unlock', 'settings.security.whatsapp.unlocked')}
            className="bg-primary shadow-brand flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
          >
            <Unlock className="size-4" />
            {t('settings.security.whatsapp.unlock')}
          </button>
        ) : (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => run('lock', 'settings.security.whatsapp.locked')}
            className="flex h-11 items-center gap-2 rounded-xl border border-negative-bg px-4 text-[13px] font-semibold text-negative transition hover:bg-negative-bg-soft disabled:opacity-60"
          >
            <Lock className="size-4" />
            {t('settings.security.whatsapp.lock')}
          </button>
        )}
        {channel.hasPin ? (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => run('resetPin', 'settings.security.whatsapp.pinReset')}
            className="h-11 rounded-xl border border-hairline px-4 text-[13px] font-semibold text-brand-700 transition hover:border-brand-border hover:bg-brand-50 disabled:opacity-60"
          >
            {t('settings.security.whatsapp.resetPin')}
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-hairline pt-4">
        <div className="min-w-0">
          <p className="text-[13.5px] font-bold text-ink">{t('settings.security.whatsapp.optIn')}</p>
          <p className="text-[12px] text-muted-foreground">{t('settings.security.whatsapp.optInHint')}</p>
        </div>
        <Toggle
          on={channel.optIn}
          busy={action.isPending}
          label={t('settings.security.whatsapp.optIn')}
          onToggle={() =>
            run(
              { optIn: !channel.optIn },
              channel.optIn
                ? 'settings.security.whatsapp.optedOut'
                : 'settings.security.whatsapp.optedIn',
            )
          }
        />
      </div>
    </section>
  );
}

function IconTile({ icon: Icon }: { icon: typeof Lock }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
      <Icon className="size-[18px]" />
    </span>
  );
}

function Toggle({
  on,
  onToggle,
  label,
  busy = false,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={busy}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60',
        on ? 'bg-brand-500' : 'bg-field',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all',
          on ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  );
}
