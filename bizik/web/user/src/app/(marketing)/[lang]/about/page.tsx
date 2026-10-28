import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/app/(marketing)/_bizik/Icon';
import { SITE } from '@/app/(marketing)/_bizik/site';
import { Breadcrumbs } from '@/app/(marketing)/_bizik/shared';
import { alternatesFor, getTranslator, toLang, localeHref } from '@/app/(marketing)/_bizik/i18n';

const IMG = '/marketing/images';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return {
    title: t('about.meta.title'),
    description: t('about.meta.description'),
    alternates: alternatesFor(lang, '/about'),
    openGraph: {
      title: t('about.meta.title'),
      description: t('about.meta.description'),
      url: localeHref(lang, '/about'),
      type: 'website',
    },
  };
}

interface CardItem { title: string; text: string }
interface TimelineEntry { year: string; text: string }

/** Icons and which entries are already done are fixed; only the words change. */
const SURFACE_ICONS = ['whatsapp', 'mobile', 'globe'];
const TIMELINE_DONE = [true, true, false];

export default async function AboutPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  const surfaces = t.items<CardItem>('about.surfaces');
  const values = t.items<CardItem>('about.values');
  const timeline = t.items<TimelineEntry>('about.timeline');

  return (
    <>
      {/* Page hero */}
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner">
          <Breadcrumbs lang={lang} trail={[{ label: t('about.crumb') }]} />
          <p className="q-eyebrow q-eyebrow--light">{t('about.eyebrow')}</p>
          <h1 className="q-h1 q-pagehero__title">{t('about.title')}</h1>
          <p className="q-pagehero__text">{t('about.text')}</p>
        </div>
      </section>

      {/* Why we started */}
      <section className="q-section q-section--lg">
        <div className="q-container q-split">
          <div className="q-photo q-photo--tall">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marketing/images/buyamsellams.webp" alt={t('about.whyImgAlt')} loading="lazy" />
          </div>
          <div>
            <p className="q-eyebrow">{t('about.whyEyebrow')}</p>
            <div className="q-prose q-mt-16">
              <p>{t('about.whyP1')}</p>
              <p>{t('about.whyP2')}</p>
              <p>{t('about.whyP3')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Surfaces */}
      <section className="q-section q-section--lg q-section--tint q-reveal">
        <div className="q-container">
          <div className="q-sechead">
            <div className="q-sechead__text">
              <h2 className="q-h2">{t('about.surfacesTitle')}</h2>
              <p className="q-body q-sechead__sub">{t('about.surfacesSub')}</p>
            </div>
          </div>
          <div className="q-grid q-grid--3">
            {surfaces.map((surface, index) => (
              <div
                className={`q-card q-card--pad-lg q-card--hover q-relative${index === 0 ? ' q-card--whatsapp' : ''}`}
                key={surface.title}
              >
                {index === 0 && (
                  <span className="q-tag q-badge--green" style={{ position: 'absolute', top: 18, right: 18 }}>
                    {t('about.newTag')}
                  </span>
                )}
                <span className="q-icon-tile"><Icon name={SURFACE_ICONS[index]} size={20} /></span>
                <h3 className="q-h5 q-mt-16">{surface.title}</h3>
                <p className="q-card__text q-mt-8">{surface.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission & vision */}
      <section className="q-section q-reveal">
        <div className="q-container q-grid q-grid--2">
          <div className="q-card q-card--navy q-card--pad-lg">
            <p className="q-eyebrow q-eyebrow--light">{t('about.missionEyebrow')}</p>
            <p className="q-h4 q-mt-12">{t('about.mission')}</p>
          </div>
          <div className="q-card q-card--blue q-card--pad-lg">
            <p className="q-eyebrow q-eyebrow--light">{t('about.visionEyebrow')}</p>
            <p className="q-h4 q-mt-12" style={{ color: '#fff' }}>{t('about.vision')}</p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="q-section q-section--lg q-section--tint2 q-reveal">
        <div className="q-container">
          <h2 className="q-h3 q-mb-32">{t('about.valuesTitle')}</h2>
          <div className="q-grid q-grid--5">
            {values.map((value) => (
              <div className="q-card" key={value.title}>
                <h3 className="q-card__title">{value.title}</h3>
                <p className="q-card__text q-mt-8">{value.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Where we are + timeline */}
      <section className="q-section q-section--lg q-reveal">
        <div className="q-container q-split q-split--wide-left" style={{ alignItems: 'start' }}>
          <div className="q-about__where">
            <h2 className="q-h3">{t('about.whereTitle')}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="q-about__team-img"
              src={`${IMG}/teamsimage.webp`}
              alt={t('about.teamImgAlt')}
              width={1445}
              height={720}
              loading="lazy"
            />
          </div>
          <div className="q-timeline">
            {timeline.map((entry, index) => (
              <div className={`q-tl-item${TIMELINE_DONE[index] ? ' q-tl-item--done' : ''}`} key={entry.year}>
                <span className="q-tl-marker">{entry.year}</span>
                <p className="q-body" style={{ paddingTop: 14 }}>{entry.text}</p>
              </div>
            ))}
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
              <Link className="q-btn q-btn--solid-white" href={SITE.signupUrl}>{t('home.closing.ctaPrimary')}</Link>
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
