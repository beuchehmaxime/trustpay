import Link from 'next/link';
import { headers } from 'next/headers';

import { BackButton } from '@/components/navigation/back-button';
import { Icon } from '@/app/(marketing)/_bizik/Icon';
import { DEFAULT_LANG, getTranslator, isLang, localeHref, type Lang } from '@/app/(marketing)/_bizik/i18n';

/**
 * The public site's 404: an unknown address, or a blog post / category that no
 * longer exists. Rendered inside the marketing layout, so the header, footer and
 * language switch stay available and the visitor is never stranded.
 *
 * not-found pages receive no route params, so the language comes from the header
 * the middleware sets for every marketing request (the same source the root
 * layout uses for <html lang>).
 */
async function requestLang(): Promise<Lang> {
  const value = (await headers()).get('x-bizik-lang');
  return isLang(value) ? value : DEFAULT_LANG;
}

export default async function MarketingNotFound() {
  const lang = await requestLang();
  const t = getTranslator(lang);
  const homeHref = localeHref(lang, '/');

  const suggestions = [
    { label: t('nav.howItWorks'), href: '/how-it-works' },
    { label: t('nav.helpCentre'), href: '/help-centre' },
    { label: t('nav.contact'), href: '/contact' },
  ];

  return (
    <section className="q-404">
      {/* React hoists this into <head>; not-found pages cannot export metadata. */}
      <title>{`${t('notFound.metaTitle')} · Bizik`}</title>

      <div className="q-container q-404__inner">
        <p className="q-404__code" aria-hidden="true">404</p>
        <p className="q-eyebrow">{t('notFound.code')}</p>
        <h1 className="q-h2 q-404__title">{t('notFound.title')}</h1>
        <p className="q-404__text">{t('notFound.text')}</p>

        <div className="q-404__actions">
          <BackButton fallbackHref={homeHref} className="q-btn q-btn--outline q-btn--lg">
            <span className="q-404__back-arrow" aria-hidden="true">
              <Icon name="arrow" size={18} />
            </span>
            {t('notFound.back')}
          </BackButton>
          <Link href={homeHref} className="q-btn q-btn--primary q-btn--lg">
            {t('notFound.home')}
          </Link>
        </div>

        <nav className="q-404__suggestions" aria-label={t('notFound.suggestions')}>
          <p className="q-404__suggestions-label">{t('notFound.suggestions')}</p>
          <ul>
            {suggestions.map((suggestion) => (
              <li key={suggestion.href}>
                <Link href={localeHref(lang, suggestion.href)}>
                  {suggestion.label}
                  <Icon name="arrow" size={15} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
