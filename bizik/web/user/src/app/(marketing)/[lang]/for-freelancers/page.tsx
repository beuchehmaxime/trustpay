import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/app/(marketing)/_bizik/Icon';
import { SITE } from '@/app/(marketing)/_bizik/site';
import { Breadcrumbs } from '@/app/(marketing)/_bizik/shared';
import { alternatesFor, getTranslator, localeHref, toLang } from '@/app/(marketing)/_bizik/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return {
    title: t('freelancers.meta.title'),
    description: t('freelancers.meta.description'),
    alternates: alternatesFor(lang, '/for-freelancers'),
    openGraph: {
      title: t('freelancers.meta.title'),
      description: t('freelancers.meta.description'),
      url: localeHref(lang, '/for-freelancers'),
      type: 'website',
    },
  };
}

interface CardItem { title: string; text: string }

export default async function ForFreelancersPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  const steps = t.items<CardItem>('freelancers.steps');
  const benefits = t.items<CardItem>('freelancers.benefits');
  const other = t.items<CardItem>('freelancers.other');

  return (
    <>
      {/* Page hero */}
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner q-split">
          <div>
            <Breadcrumbs lang={lang} trail={[{ label: t('freelancers.crumb') }]} />
            <p className="q-eyebrow q-eyebrow--light">{t('freelancers.eyebrow')}</p>
            <h1 className="q-h1 q-pagehero__title">{t('freelancers.title')}</h1>
            <p className="q-pagehero__text">{t('freelancers.text')}</p>
            <div className="q-pagehero__cta">
              <Link className="q-btn q-btn--primary" href={SITE.signupUrl}>
                {t('freelancers.ctaPrimary')}
              </Link>
              <Link className="q-btn q-btn--ghost-light" href={localeHref(lang, '/how-it-works')}>
                {t('freelancers.ctaSecondary')}
              </Link>
            </div>
          </div>

          <div className="q-relative">
            <div className="q-photo q-photo--tall">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/images/freelancers.webp" alt={t('freelancers.imgAlt')} loading="lazy" />
            </div>
            <div className="q-float q-float--paid">
              <p className="q-float__title">{t('freelancers.floatTitle')}</p>
              <p className="q-h5 q-mt-8">150,000 XAF</p>
              <span className="q-tag q-badge--green q-mt-8" style={{ display: 'inline-block' }}>
                {t('freelancers.floatTag')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="q-section q-section--lg">
        <div className="q-container">
          <div className="q-sechead">
            <div className="q-sechead__text">
              <p className="q-eyebrow">{t('freelancers.problemEyebrow')}</p>
              <h2 className="q-h2 q-sechead__title">{t('freelancers.problemTitle')}</h2>
              <p className="q-body q-sechead__sub">{t('freelancers.problemText')}</p>
            </div>
          </div>

          <div className="q-grid q-grid--3">
            <div className="q-card q-card--pad-lg">
              <h3 className="q-card__title">{steps[0]?.title}</h3>
              <p className="q-card__text q-mt-12">{steps[0]?.text}</p>
            </div>
            <div className="q-card q-card--pad-lg">
              <h3 className="q-card__title">{steps[1]?.title}</h3>
              <p className="q-card__text q-mt-12">{steps[1]?.text}</p>
            </div>
            <div className="q-card q-card--pad-lg">
              <h3 className="q-card__title">{steps[2]?.title}</h3>
              <p className="q-card__text q-mt-12">{steps[2]?.text}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="q-section q-section--tint q-reveal">
        <div className="q-container">
          <div className="q-grid q-grid--4">
            <div>
              <span className="q-icon-tile">
                <svg
                  className="q-icon"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M12 4l2.4 5 5.6.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.6-.8z" />
                </svg>
              </span>
              <h3 className="q-card__title q-mt-16">{benefits[0]?.title}</h3>
              <p className="q-card__text q-mt-8">{benefits[0]?.text}</p>
            </div>
            <div>
              <span className="q-icon-tile">
                <Icon name="globe" size={20} />
              </span>
              <h3 className="q-card__title q-mt-16">{benefits[1]?.title}</h3>
              <p className="q-card__text q-mt-8">{benefits[1]?.text}</p>
            </div>
            <div>
              <span className="q-icon-tile">
                <Icon name="refresh" size={20} />
              </span>
              <h3 className="q-card__title q-mt-16">{benefits[2]?.title}</h3>
              <p className="q-card__text q-mt-8">{benefits[2]?.text}</p>
            </div>
            <div>
              <span className="q-icon-tile">
                <Icon name="file" size={20} />
              </span>
              <h3 className="q-card__title q-mt-16">{benefits[3]?.title}</h3>
              <p className="q-card__text q-mt-8">{benefits[3]?.text}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Quote */}
      <section className="q-section q-reveal">
        <div className="q-container">
          <figure
            className="q-card q-card--pad-lg q-center"
            style={{ maxWidth: 900, marginInline: 'auto' }}
          >
            <blockquote className="q-h4" style={{ fontWeight: 600, lineHeight: 1.4 }}>
              &ldquo;{t('freelancers.quote')}&rdquo;
            </blockquote>
            <figcaption
              className="q-quote__who"
              style={{ justifyContent: 'center', marginTop: 24 }}
            >
              <span className="q-quote__avatar">AN</span>
              <span className="q-left">
                <span className="q-quote__name">{t('freelancers.quoteName')}</span>
                <br />
                <span className="q-quote__role">{t('freelancers.quoteRole')}</span>
              </span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Other use cases */}
      <section className="q-section q-section--tint2 q-reveal">
        <div className="q-container">
          <h2 className="q-h4 q-mb-24">{t('freelancers.otherTitle')}</h2>
          <div className="q-grid q-grid--4">
            <div className="q-card q-card--hover">
              <h3 className="q-card__title">{other[0]?.title}</h3>
              <p className="q-card__text q-mt-8">{other[0]?.text}</p>
            </div>
            <div className="q-card q-card--hover">
              <h3 className="q-card__title">{other[1]?.title}</h3>
              <p className="q-card__text q-mt-8">{other[1]?.text}</p>
            </div>
            <div className="q-card q-card--hover">
              <h3 className="q-card__title">{other[2]?.title}</h3>
              <p className="q-card__text q-mt-8">{other[2]?.text}</p>
            </div>
            <div className="q-card q-card--hover">
              <h3 className="q-card__title">{other[3]?.title}</h3>
              <p className="q-card__text q-mt-8">{other[3]?.text}</p>
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
              <a
                className="q-btn q-btn--ghost-light"
                href={SITE.whatsappUrl}
                target="_blank"
                rel="noopener"
              >
                {t('chrome.startOnWhatsApp')}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
