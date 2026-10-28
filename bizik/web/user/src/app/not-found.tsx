'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, SearchX } from 'lucide-react';

import { BackButton } from '@/components/navigation/back-button';

/**
 * 404 for everything outside the public site: the logged-in app and auth pages
 * (`/dashboard/...`, `/wallet/...`, `/deals/...`). Marketing addresses have their
 * own, rendered inside the site chrome - see `(marketing)/[lang]/not-found.tsx`.
 *
 * A client component so it speaks the language the user chose in the app, which
 * lives in the app's i18next state rather than in the URL.
 */
export default function NotFound() {
  const { t } = useTranslation();

  return (
    <main className="bg-background flex min-h-[100dvh] flex-1 items-center justify-center px-5 py-16">
      <title>{`${t('notFound.title')} · Bizik`}</title>

      <div className="flex w-full max-w-[460px] flex-col items-center text-center">
        <span className="bg-brand-50 text-brand-600 flex size-16 items-center justify-center rounded-2xl">
          <SearchX className="size-8" aria-hidden="true" />
        </span>

        <p className="text-brand-600 mt-6 text-xs font-bold tracking-[0.12em] uppercase">
          {t('notFound.code')}
        </p>
        <h1 className="text-ink mt-2 text-2xl font-extrabold tracking-tight sm:text-[28px]">
          {t('notFound.title')}
        </h1>
        <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed">{t('notFound.text')}</p>

        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <BackButton
            fallbackHref="/dashboard"
            className="border-border text-ink hover:bg-muted inline-flex h-12 items-center justify-center gap-2 rounded-xl border px-5 text-sm font-semibold transition"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('notFound.back')}
          </BackButton>
          <Link
            href="/dashboard"
            className="bg-primary shadow-brand inline-flex h-12 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white transition hover:opacity-95"
          >
            {t('notFound.dashboard')}
          </Link>
        </div>

        <Link href="/" className="text-brand-700 mt-6 text-sm font-semibold hover:underline">
          {t('notFound.home')}
        </Link>
      </div>
    </main>
  );
}
