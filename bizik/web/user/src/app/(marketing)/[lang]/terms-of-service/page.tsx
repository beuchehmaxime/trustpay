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
    title: t('content.legal.termsTitle'),
    description: t('content.legal.termsDescription'),
    alternates: alternatesFor(lang, '/terms-of-service'),
  };
}

export default async function TermsPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return <LegalDoc type="terms-of-service" fallbackTitle={t('content.legal.termsTitle')} lang={lang} />;
}
