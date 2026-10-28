import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/app/(marketing)/_bizik/Icon';
import { SITE } from '@/app/(marketing)/_bizik/site';
import { Breadcrumbs } from '@/app/(marketing)/_bizik/shared';
import { SUPPORT_EMAILS } from '@/app/(marketing)/_bizik/site';
import { alternatesFor, getTranslator, localeHref, toLang } from '@/app/(marketing)/_bizik/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return {
    title: t('security.meta.title'),
    description: t('security.meta.description'),
    alternates: alternatesFor(lang, '/security'),
    openGraph: {
      title: t('security.meta.title'),
      description: t('security.meta.description'),
      url: localeHref(lang, '/security'),
      type: 'website',
    },
  };
}

interface CardItem { title: string; text: string }

export default async function SecurityPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  const funds = t.items<CardItem>('security.funds');
  const platform = t.items<CardItem>('security.platform');

  return (
    <>
      {/* Page hero */}
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner">
          <Breadcrumbs lang={lang} trail={[{ label: t('security.crumb') }]} />
          <p className="q-eyebrow q-eyebrow--light">{t('security.eyebrow')}</p>
          <h1 className="q-h1 q-pagehero__title">{t('security.title')}</h1>
          <p className="q-pagehero__text">{t('security.text')}</p>
        </div>
      </section>

      {/* How funds are protected + fund flow */}
      <section className="q-section q-section--lg">
        <div className="q-container q-split q-split--wide-left" style={{ alignItems: 'start' }}>
          <div>
            <h2 className="q-h3 q-mb-24">{t('security.fundsTitle')}</h2>
            <div className="q-stack q-gap-16">
              <div className="q-card">
                <div className="q-featrow">
                  <span className="q-icon-tile q-icon-tile--sm">
                    <svg
                      className="q-icon"
                      width={17}
                      height={17}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M3 9l9-5 9 5" />
                      <path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9" />
                      <path d="M3 21h18" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="q-card__title">{funds[0]?.title}</h3>
                    <p className="q-card__text q-mt-8">{funds[0]?.text}</p>
                  </div>
                </div>
              </div>
              <div className="q-card">
                <div className="q-featrow">
                  <span className="q-icon-tile q-icon-tile--sm">
                    <Icon name="check" size={17} />
                  </span>
                  <div>
                    <h3 className="q-card__title">{funds[1]?.title}</h3>
                    <p className="q-card__text q-mt-8">{funds[1]?.text}</p>
                  </div>
                </div>
              </div>
              <div className="q-card">
                <div className="q-featrow">
                  <span className="q-icon-tile q-icon-tile--sm">
                    <svg
                      className="q-icon"
                      width={17}
                      height={17}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="q-card__title">{funds[2]?.title}</h3>
                    <p className="q-card__text q-mt-8">{funds[2]?.text}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="q-card q-card--pad-lg q-card--tint">
            <p className="q-eyebrow q-mb-20">{t('security.flowEyebrow')}</p>
            <div className="q-fundflow">
              <div className="q-fundflow__node">
                <b>{t('security.flowInTitle')}</b>
                <i>{t('security.flowInMeta')}</i>
              </div>
              <span className="q-fundflow__arrow" aria-hidden="true">↓</span>
              <div className="q-fundflow__node q-fundflow__node--key">
                <b>{t('security.flowEscrowTitle')}</b>
                <i>{t('security.flowEscrowMeta')}</i>
              </div>
              <span className="q-fundflow__arrow" aria-hidden="true">↓</span>
              <div className="q-fundflow__node">
                <b>{t('security.flowOutTitle')}</b>
                <i>{t('security.flowOutMeta')}</i>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform, identity and account security */}
      <section className="q-section q-section--lg q-section--tint q-reveal">
        <div className="q-container">
          <h2 className="q-h3 q-mb-32">{t('security.platformTitle')}</h2>

          <div className="q-featcards">
            <div className="q-card q-card--hover">
              <span className="q-icon-tile">
                <Icon name="lock" size={20} />
              </span>
              <h3 className="q-card__title q-mt-16">{platform[0]?.title}</h3>
              <p className="q-card__text q-mt-8">{platform[0]?.text}</p>
            </div>
            <div className="q-card q-card--hover">
              <span className="q-icon-tile">
                <Icon name="id" size={20} />
              </span>
              <h3 className="q-card__title q-mt-16">{platform[1]?.title}</h3>
              <p className="q-card__text q-mt-8">{platform[1]?.text}</p>
            </div>
            <div className="q-card q-card--hover">
              <span className="q-icon-tile">
                <svg
                  className="q-icon"
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M12 4l9 16H3z" />
                  <path d="M12 10v4" />
                  <circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <h3 className="q-card__title q-mt-16">{platform[2]?.title}</h3>
              <p className="q-card__text q-mt-8">{platform[2]?.text}</p>
            </div>
            <div className="q-card q-card--hover">
              <span className="q-icon-tile">
                <svg
                  className="q-icon"
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M12 3l7 2.6v5.2c0 4.4-3 8-7 9.2-4-1.2-7-4.8-7-9.2V5.6z" />
                </svg>
              </span>
              <h3 className="q-card__title q-mt-16">{platform[3]?.title}</h3>
              <p className="q-card__text q-mt-8">{platform[3]?.text}</p>
            </div>
            <div className="q-card q-card--hover">
              <span className="q-icon-tile">
                <svg
                  className="q-icon"
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle cx="8" cy="13" r="4" />
                  <path d="M11.5 11L20 4" />
                  <path d="M17 7l2 2" />
                </svg>
              </span>
              <h3 className="q-card__title q-mt-16">{platform[4]?.title}</h3>
              <p className="q-card__text q-mt-8">{platform[4]?.text}</p>
            </div>
            <div className="q-card q-card--hover">
              <span className="q-icon-tile">
                <Icon name="scale" size={20} />
              </span>
              <h3 className="q-card__title q-mt-16">{platform[5]?.title}</h3>
              <p className="q-card__text q-mt-8">{platform[5]?.text}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Responsible disclosure */}
      <section className="q-section q-reveal">
        <div className="q-container">
          <div className="q-card q-card--navy q-card--pad-lg q-split" style={{ alignItems: 'center' }}>
            <div>
              <h2 className="q-h4">{t('security.vulnTitle')}</h2>
              <p className="q-body q-mt-12">{t('security.vulnText')}</p>
            </div>
            <div className="q-row q-gap-16 q-row--wrap">
              <div>
                <p className="q-eyebrow q-eyebrow--light">{t('security.reportTo')}</p>
                <p className="q-h6 q-mt-8" style={{ color: '#fff' }}>{SUPPORT_EMAILS.security}</p>
              </div>
              <Link className="q-btn q-btn--solid-white q-btn--sm" href={localeHref(lang, '/contact')}>
                {t('security.contactTeam')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="q-section q-section--tight q-reveal">
        <div className="q-container">
          <div className="q-cta">
            <div>
              <p className="q-cta__title">{t('home.closing.title')}</p>
              <p className="q-cta__text">{t('home.closing.text')}</p>
            </div>
            <div className="q-cta__actions">
              <Link className="q-btn q-btn--solid-white" href={SITE.signupUrl}>
                {t('home.closing.ctaPrimary')}
              </Link>
              <a className="q-btn q-btn--ghost-light" href={SITE.whatsappUrl} target="_blank" rel="noopener">
                {t('chrome.startOnWhatsApp')}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
