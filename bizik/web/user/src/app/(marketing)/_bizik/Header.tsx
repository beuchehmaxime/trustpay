import Image from 'next/image';
import Link from 'next/link';

import { Icon } from './Icon';
import { LangSwitch } from './LangSwitch';
import { NavLinks, type NavItem } from './NavLinks';
import { DEFAULT_LANG, getTranslator, localeHref, type Lang } from './i18n';
import { SITE } from './site';

/**
 * Public site header. Static markup; the sticky shadow and the mobile drawer
 * toggle are wired up progressively by BizikScripts, so this stays a server
 * component and the nav renders instantly for SEO.
 *
 * The language comes from the route via the layout. Labels are resolved here on
 * the server and the hrefs are prefixed before they reach `NavLinks`, so the
 * client component never has to know which language it is rendering.
 */
export function Header({ lang = DEFAULT_LANG }: { lang?: Lang }) {
  const t = getTranslator(lang);

  const items: NavItem[] = [
    { href: localeHref(lang, '/how-it-works'), label: t('nav.howItWorks') },
    { href: localeHref(lang, '/for-freelancers'), label: t('nav.forFreelancers') },
    { href: localeHref(lang, '/pricing'), label: t('nav.pricing') },
    { href: localeHref(lang, '/security'), label: t('nav.security') },
    { href: localeHref(lang, '/blog'), label: t('nav.blog') },
    { href: localeHref(lang, '/help-centre'), label: t('nav.helpCentre') },
  ];

  return (
    <>
      <a className="skip-link" href="#q-main">
        {t('chrome.skipToContent')}
      </a>

      <header className="q-header" id="q-header">
        <div className="q-container q-header__inner">
          <Link
            className="q-logo"
            href={localeHref(lang, '/')}
            aria-label={t('chrome.homeAria', { name: SITE.name })}
          >
            <Image
              className="q-logo__img"
              src="/marketing/images/logo-landscape.png"
              alt={SITE.name}
              width={4647}
              height={1491}
              priority
            />
          </Link>

          <nav className="q-nav" aria-label={t('chrome.primaryNav')}>
            <NavLinks className="q-nav__list" items={items} />
          </nav>

          <div className="q-header__actions">
            <LangSwitch lang={lang} label={t('chrome.language')} />

            <Link className="q-header__login" href={SITE.loginUrl}>
              {t('chrome.logIn')}
            </Link>

            <Link className="q-btn q-btn--primary q-btn--sm" href={SITE.signupUrl}>
              {t('chrome.getStarted')}
            </Link>

            <button
              className="q-icon-btn q-burger"
              type="button"
              aria-expanded="false"
              aria-controls="q-mobile-nav"
              aria-label={t('chrome.menu')}
            >
              <span className="q-burger__inner">
                <span className="q-burger__bar" />
                <span className="q-burger__bar" />
                <span className="q-burger__bar" />
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="q-mobile-nav" id="q-mobile-nav">
        <NavLinks className="q-mobile-nav__list" items={items} />

        {/* The header's EN/FR toggle is hidden below 1024px, so the menu carries
            its own. Choosing a language navigates, which also closes the menu. */}
        <div className="q-mobile-nav__lang">
          <span className="q-mobile-nav__lang-label">{t('chrome.language')}</span>
          <LangSwitch lang={lang} label={t('chrome.language')} className="q-lang--menu" />
        </div>

        <div className="q-mobile-nav__actions">
          <Link className="q-btn q-btn--outline q-btn--block" href={SITE.loginUrl}>
            {t('chrome.logIn')}
          </Link>
          <Link className="q-btn q-btn--primary q-btn--block" href={SITE.signupUrl}>
            {t('chrome.getStarted')}
          </Link>
          <a
            className="q-btn q-btn--whatsapp q-btn--block"
            href={SITE.whatsappUrl}
            target="_blank"
            rel="noopener"
          >
            <Icon name="whatsapp" size={20} />
            {t('chrome.startOnWhatsApp')}
          </a>
        </div>
      </div>
    </>
  );
}
