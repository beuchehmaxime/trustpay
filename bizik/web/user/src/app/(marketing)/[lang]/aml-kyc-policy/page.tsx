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
    title: t('content.legal.amlTitle'),
    description: t('content.legal.amlDescription'),
    alternates: alternatesFor(lang, '/aml-kyc-policy'),
  };
}

export default async function AmlKycPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return <LegalDoc type="aml-kyc-policy" fallbackTitle={t('content.legal.amlTitle')} lang={lang} />;
}
