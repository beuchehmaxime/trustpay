import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import '@/app/(marketing)/_bizik/fonts.css';
import '@/app/(marketing)/_bizik/main.css';
import { Header } from '@/app/(marketing)/_bizik/Header';
import { Footer } from '@/app/(marketing)/_bizik/Footer';
import { BizikScripts } from '@/app/(marketing)/_bizik/Scripts';
import { MARKETING_LANGS, isLang } from '@/app/(marketing)/_bizik/i18n';
import { OrganisationJsonLd } from '@/app/(marketing)/_bizik/JsonLd';
import { HtmlLangSync } from '@/app/(marketing)/_bizik/HtmlLangSync';

/**
 * Public marketing shell for the Bizik site. The design's self-contained CSS
 * (main.css) is imported here so Next only ships it on marketing routes - it
 * never reaches the logged-in app. Header/Footer render on the server for SEO;
 * BizikScripts adds progressive interactivity on the client.
 *
 * The language comes from the route rather than from client state, so the very
 * first response is already in the right language for crawlers and for anyone
 * arriving on a shared link.
 */
export function generateStaticParams() {
  return MARKETING_LANGS.map((lang) => ({ lang }));
}

export default async function MarketingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  // `[lang]` is a dynamic segment at the root, so it would otherwise answer for
  // any unrecognised path. Only the languages we publish are real pages.
  if (!isLang(lang)) notFound();

  return (
    // `lang` lives on the shell as well as on <html>: this element re-renders when
    // the visitor switches language in-app, <html> does not, and the phone hero's
    // French rules (`:lang(fr)` in main.css) must apply either way.
    <div className="q-body q-shell" lang={lang}>
      <HtmlLangSync lang={lang} />
      <OrganisationJsonLd lang={lang} />
      <Header lang={lang} />
      <main id="q-main" className="q-main">
        {children}
      </main>
      <Footer lang={lang} />
      <BizikScripts />
    </div>
  );
}
