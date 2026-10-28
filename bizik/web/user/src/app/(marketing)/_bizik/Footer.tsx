import Image from 'next/image';
import Link from 'next/link';

import { DEFAULT_LANG, getTranslator, localeHref, type Lang } from './i18n';

import { Icon } from './Icon';
import { FOOTER_COLUMNS, SITE } from './site';

/** Public site footer - brand blurb, store badges, socials, link columns. */
export function Footer({ lang = DEFAULT_LANG }: { lang?: Lang }) {
  const year = new Date().getFullYear();
  const t = getTranslator(lang);
  return (
    <footer className="q-footer">
      <div className="q-container q-footer__main">
        <div className="q-footer__brand">
          <Link className="q-logo" href={localeHref(lang, '/')} aria-label={`${SITE.name} home`}>
            <Image
              className="q-logo__img"
              src="/marketing/images/logo-landscape.png"
              alt={SITE.name}
              width={4647}
              height={1491}
              priority
            />
          </Link>
          <p className="q-footer__about">{t('footer.about')}</p>

          <div className="q-store-badges">
            <a className="q-store-badge" href={SITE.appStoreUrl}>
              <Icon name="phone" size={15} />
              App Store
            </a>
            <a className="q-store-badge" href={SITE.playStoreUrl}>
              <Icon name="arrow-right" size={15} />
              Google Play
            </a>
          </div>

          <div className="q-share q-mt-20">
            <a href={SITE.social.twitter} target="_blank" rel="noopener" aria-label="Twitter">
              <Icon name="twitter" size={17} />
            </a>
            <a href={SITE.social.linkedin} target="_blank" rel="noopener" aria-label="LinkedIn">
              <Icon name="linkedin" size={17} />
            </a>
            <a href={SITE.social.facebook} target="_blank" rel="noopener" aria-label="Facebook">
              <Icon name="facebook" size={17} />
            </a>
          </div>
        </div>

        {FOOTER_COLUMNS.map((column) => (
          <div className="q-footer__col" key={column.titleKey}>
            <h2 className="q-footer__col-title">{t(column.titleKey)}</h2>
            <ul>
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={localeHref(lang, link.href)}>{t(link.labelKey)}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="q-container">
        <div className="q-footer__bottom">
          <p>
            &copy; {year} {SITE.name} &middot; {t('footer.tagline')}
          </p>
          <div className="q-footer__marks">
            {t.items<string>('footer.marks').map((mark) => (
              <span key={mark}>{mark}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
