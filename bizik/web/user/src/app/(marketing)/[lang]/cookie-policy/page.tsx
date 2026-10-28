import type { Metadata } from 'next';

import { LegalDoc } from '@/app/(marketing)/_bizik/LegalDoc';
import { alternatesFor, getTranslator, toLang } from '@/app/(marketing)/_bizik/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return {
    title: t('content.legal.cookieTitle'),
    description: t('content.legal.cookieDescription'),
    alternates: alternatesFor(lang, '/cookie-policy'),
  };
}

export default async function CookiePage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return <LegalDoc type="cookie-policy" fallbackTitle={t('content.legal.cookieTitle')} lang={lang} />;
}
