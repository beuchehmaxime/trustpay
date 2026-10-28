import type { Metadata } from 'next';

import { Breadcrumbs } from '@/app/(marketing)/_bizik/shared';
import { Icon } from '@/app/(marketing)/_bizik/Icon';
import { alternatesFor, getTranslator, localeHref, toLang } from '@/app/(marketing)/_bizik/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return {
    title: t('business.meta.title'),
    description: t('business.meta.description'),
    alternates: alternatesFor(lang, '/for-business'),
    openGraph: {
      title: t('business.meta.title'),
      description: t('business.meta.description'),
      url: localeHref(lang, '/for-business'),
      type: 'website',
    },
  };
}

/**
 * The theme's `check` glyph is a plain tick (`M20 6L9 17l-5-5`), which differs
 * from the shared Icon component's circled `check`. Reproduced inline so the
 * checkmarks stay pixel-faithful to the source.
 */
function CheckMark({ size }: { size: number }) {
  return (
    <svg
      className="q-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

const CODE_SNIPPET = `{
  "amount": 450000,
  "currency": "XAF",
  "buyer":  { "phone": "+2376XXXXXXXX" },
  "seller": { "phone": "+2376XXXXXXXX" },
  "milestones": [
    { "label": "Design", "amount": 150000 },
    { "label": "Build",  "amount": 300000 }
  ],
  "fee_payer": "split",
  "payout": { "rail": "mtn_momo" },
  "webhook": "https://your.app/hooks/bizik"
}`;

interface CardItem { title: string; text: string }

export default async function ForBusinessPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  const capabilities = t.items<CardItem>('business.capabilities');

  return (
    <>
      {/* Page hero */}
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner q-split">
          <div>
            <Breadcrumbs lang={lang} trail={[{ label: t('business.crumb') }]} />
            <p className="q-eyebrow q-eyebrow--light">{t('business.eyebrow')}</p>
            <h1 className="q-h1 q-pagehero__title">{t('business.title')}</h1>
            <p className="q-pagehero__text">{t('business.text')}</p>
            <div className="q-pagehero__cta">
              <a className="q-btn q-btn--primary" href="#q-business-form">{t('business.ctaTalk')}</a>
              <a className="q-btn q-btn--ghost-light" href="#q-capabilities">{t('business.ctaDocs')}</a>
            </div>
          </div>

          <div className="q-code">
            <p className="q-code__head"><span className="q-code__verb">POST</span> /v1/escrows</p>
            <pre><code>{CODE_SNIPPET}</code></pre>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="q-section q-section--lg" id="q-capabilities">
        <div className="q-container">
          <div className="q-sechead">
            <div className="q-sechead__text">
              <p className="q-eyebrow">{t('business.capEyebrow')}</p>
              <h2 className="q-h2 q-sechead__title">{t('business.capTitle')}</h2>
            </div>
          </div>

          <div className="q-featcards">
            <div className="q-card q-card--hover">
              <span className="q-icon-tile">
                <svg className="q-icon" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><circle cx="7" cy="7.5" r=".7" fill="currentColor" stroke="none" /><circle cx="7" cy="16.5" r=".7" fill="currentColor" stroke="none" /></svg>
              </span>
              <h3 className="q-card__title q-mt-16">{capabilities[0]?.title}</h3>
              <p className="q-card__text q-mt-8">{capabilities[0]?.text}</p>
            </div>

            <div className="q-card q-card--hover">
              <span className="q-icon-tile"><Icon name="wallet" size={20} /></span>
              <h3 className="q-card__title q-mt-16">{capabilities[1]?.title}</h3>
              <p className="q-card__text q-mt-8">{capabilities[1]?.text}</p>
            </div>

            <div className="q-card q-card--hover">
              <span className="q-icon-tile"><Icon name="convert" size={20} /></span>
              <h3 className="q-card__title q-mt-16">{capabilities[2]?.title}</h3>
              <p className="q-card__text q-mt-8">{capabilities[2]?.text}</p>
            </div>

            <div className="q-card q-card--hover">
              <span className="q-icon-tile"><Icon name="id" size={20} /></span>
              <h3 className="q-card__title q-mt-16">{capabilities[3]?.title}</h3>
              <p className="q-card__text q-mt-8">{capabilities[3]?.text}</p>
            </div>

            <div className="q-card q-card--hover">
              <span className="q-icon-tile"><Icon name="scale" size={20} /></span>
              <h3 className="q-card__title q-mt-16">{capabilities[4]?.title}</h3>
              <p className="q-card__text q-mt-8">{capabilities[4]?.text}</p>
            </div>

            <div className="q-card q-card--hover">
              <span className="q-icon-tile">
                <svg className="q-icon" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M10 13.5a3.5 3.5 0 005 0l3-3a3.5 3.5 0 10-5-5l-1 1" /><path d="M14 10.5a3.5 3.5 0 00-5 0l-3 3a3.5 3.5 0 105 5l1-1" /></svg>
              </span>
              <h3 className="q-card__title q-mt-16">{capabilities[5]?.title}</h3>
              <p className="q-card__text q-mt-8">{capabilities[5]?.text}</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it fits together */}
      <section className="q-section q-section--navy q-on-dark q-reveal">
        <div className="q-container">
          <h2 className="q-h3 q-mb-32">{t('business.pipelineTitle')}</h2>
          <div className="q-pipeline">
            <div className="q-pipeline__box">
              <b>{t('business.pipeYouTitle')}</b>
              <i>{t('business.pipeYouMeta')}</i>
            </div>
            <span className="q-pipeline__arrow" aria-hidden="true">→</span>
            <div className="q-pipeline__box q-pipeline__box--key">
              <b>{t('business.pipeUsTitle')}</b>
              <i>{t('business.pipeUsMeta')}</i>
            </div>
            <span className="q-pipeline__arrow" aria-hidden="true">→</span>
            <div className="q-pipeline__box">
              <b>{t('business.pipeOutTitle')}</b>
              <i>{t('business.pipeOutMeta')}</i>
            </div>
          </div>
        </div>
      </section>

      {/* Business contact form */}
      <section className="q-section q-section--lg q-section--tint q-reveal" id="q-business-form">
        <div className="q-container q-contact">
          <div>
            <h2 className="q-h3">{t('business.formTitle')}</h2>
            <p className="q-body q-mt-16">{t('business.formText')}</p>
            <ul className="q-checklist q-mt-24">
              {t.list('business.checklist').map((point) => (
                <li key={point}><CheckMark size={16} /><span>{point}</span></li>
              ))}
            </ul>
          </div>

          <div className="q-card q-card--pad-lg">
            <form method="post" className="q-stack q-gap-16">
              <input type="hidden" name="qatiqa_topic" value="Business / API" />
              <p className="q-hidden">
                <label>
                  {t('business.form.honeypot')}{' '}
                  <input type="text" name="qatiqa_website" tabIndex={-1} autoComplete="off" />
                </label>
              </p>

              <div className="q-grid q-grid--2">
                <div className="q-field">
                  <label className="q-label" htmlFor="q-biz-name">{t('business.form.name')}</label>
                  <input type="text" id="q-biz-name" name="qatiqa_name" required />
                </div>
                <div className="q-field">
                  <label className="q-label" htmlFor="q-biz-company">{t('business.form.company')}</label>
                  <input type="text" id="q-biz-company" name="qatiqa_company" />
                </div>
              </div>

              <div className="q-field">
                <label className="q-label" htmlFor="q-biz-email">{t('business.form.email')}</label>
                <input type="email" id="q-biz-email" name="qatiqa_email" required />
              </div>

              <div className="q-field">
                <label className="q-label" htmlFor="q-biz-volume">{t('business.form.volume')}</label>
                <select id="q-biz-volume" name="qatiqa_volume" defaultValue={t.list('business.form.volumes')[0]}>
                  {t.list('business.form.volumes').map((band) => (
                    <option key={band}>{band}</option>
                  ))}
                </select>
              </div>

              <div className="q-field">
                <label className="q-label" htmlFor="q-biz-message">{t('business.form.message')}</label>
                <textarea id="q-biz-message" name="qatiqa_message" required />
              </div>

              <button className="q-btn q-btn--primary q-btn--block" type="submit">{t('business.form.submit')}</button>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
