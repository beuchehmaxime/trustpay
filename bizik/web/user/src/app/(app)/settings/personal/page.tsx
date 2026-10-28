'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { PhoneField } from '@/components/ui/phone-field';
import { normaliseError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth.store';
import { cn } from '@/lib/utils';

const FIELD_CLASS =
  'h-12 w-full rounded-xl border border-hairline bg-surface px-3.5 text-[14px] text-ink outline-none transition placeholder:text-subtle focus:border-brand-border';

export default function PersonalInfoPage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);

  // Seeded from the live user. The (app) layout guarantees the session is
  // authenticated before this page renders, so `user` is present here.
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [companyName, setCompanyName] = useState(user?.companyName ?? '');
  const [phone, setPhone] = useState((user?.phone ?? '').replace(/\s/g, ''));
  const [saving, setSaving] = useState(false);

  function reset() {
    setFullName(user?.fullName ?? '');
    setEmail(user?.email ?? '');
    setCompanyName(user?.companyName ?? '');
    setPhone((user?.phone ?? '').replace(/\s/g, ''));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        // Phone is the login identity; email is optional (empty clears it).
        ...(phone !== (user?.phone ?? '').replace(/\s/g, '') ? { phone: phone.trim() } : {}),
        ...(email !== (user?.email ?? '') ? { email: email.trim() } : {}),
        ...(companyName !== (user?.companyName ?? '') ? { companyName: companyName.trim() } : {}),
      });
      toast.success(t('settings.personal.saved'));
    } catch (error) {
      toast.error(normaliseError(error).message);
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    void save();
  }

  const fullNameField = (
    <input className={FIELD_CLASS} value={fullName} onChange={(event) => setFullName(event.target.value)} />
  );
  const emailField = (
    <input
      className={FIELD_CLASS}
      type="email"
      value={email}
      onChange={(event) => setEmail(event.target.value)}
    />
  );
  const companyField = (
    <input className={FIELD_CLASS} value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
  );
  const phoneField = <PhoneField value={phone} onChange={setPhone} />;
  const country = (
    <div className="flex h-12 items-center justify-between rounded-xl border border-hairline bg-[#F5F8FC] px-3.5">
      <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
        {user?.country ?? '-'}
      </span>
      <span className="text-[11.5px] text-subtle">{t('settings.personal.fromId')}</span>
    </div>
  );

  return (
    <>
      {/* ── Mobile / PWA: single-column form ── */}
      <section className="shadow-card mx-auto w-full max-w-[560px] rounded-2xl border border-hairline bg-surface p-5 md:hidden">
        <h1 className="text-lg font-extrabold text-ink">{t('settings.personal.title')}</h1>
        <form className="mt-5 flex flex-col gap-5" onSubmit={onSubmit}>
          <Field label={t('settings.personal.fullName')}>{fullNameField}</Field>
          <Field label={t('settings.personal.phoneLogin')} hint={t('settings.personal.phoneHint')}>
            {phoneField}
          </Field>
          <Field label={t('settings.personal.emailOptional')}>{emailField}</Field>
          <Field label={t('settings.personal.country')}>{country}</Field>
          <Field label={t('settings.personal.companyOptional')}>{companyField}</Field>
          <button
            type="submit"
            disabled={saving}
            className="bg-primary shadow-brand mt-1 h-12 w-full rounded-xl text-[14.5px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
          >
            {t('settings.personal.save')}
          </button>
        </form>
      </section>

      {/* ── Desktop: wide card, two-column form ── */}
      <section className="shadow-card hidden rounded-2xl border border-hairline bg-surface p-6 md:block">
        <h1 className="text-lg font-extrabold text-ink">{t('settings.personal.title')}</h1>
        <form className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5" onSubmit={onSubmit}>
          <Field label={t('settings.personal.fullName')}>{fullNameField}</Field>
          <Field label={t('settings.personal.emailOptional')}>{emailField}</Field>
          <Field label={t('settings.personal.phoneLogin')} hint={t('settings.personal.phoneHint')}>
            {phoneField}
          </Field>
          <Field label={t('settings.personal.companyOptional')}>{companyField}</Field>
          <Field label={t('settings.personal.country')}>{country}</Field>
          <div />
          <div className="col-span-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={reset}
              className="h-11 rounded-xl border border-hairline px-5 text-[13.5px] font-semibold text-ink transition hover:bg-muted"
            >
              {t('settings.personal.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-primary shadow-brand h-11 rounded-xl px-6 text-[13.5px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {t('settings.personal.save')}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label className="mb-1.5 block text-[12.5px] font-semibold text-body">{label}</label>
      {children}
      {hint ? <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
