import type { Metadata } from 'next';
import Link from 'next/link';

import { Breadcrumbs } from '@/app/(marketing)/_bizik/shared';
import { FeeCalculator } from '@/app/(marketing)/_bizik/FeeCalculator';
import { formatPct, loadFees } from '@/app/(marketing)/_bizik/data';
import { SITE } from '@/app/(marketing)/_bizik/site';
import { alternatesFor, getTranslator, localeHref, toLang } from '@/app/(marketing)/_bizik/i18n';

export const revalidate = 300;

interface FeeRow { label: string; rate: string; who: string }
interface Faq { q: string; a: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return {
    title: t('pricing.meta.title'),
    description: t('pricing.meta.description'),
    alternates: alternatesFor(lang, '/pricing'),
    openGraph: {
      title: t('pricing.meta.title'),
      description: t('pricing.meta.description'),
      url: localeHref(lang, '/pricing'),
      type: 'website',
    },
  };
}

export default async function PricingPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  const fees = await loadFees();
  const pct = (value: number) => formatPct(value, lang);
  const freeRelease = fees.sellerPct === 0;
  const feeRows: FeeRow[] = [
    { label: t('pricing.feeRows.funding'), rate: `${pct(fees.buyerPct)}${lang === 'fr' ? ' %' : '%'}`, who: t('pricing.feeRows.fundingWho') },
    {
      label: t('pricing.feeRows.release'),
      rate: freeRelease ? t('pricing.feeRows.releaseFree') : `${pct(fees.sellerPct)}${lang === 'fr' ? ' %' : '%'}`,
      who: freeRelease ? t('pricing.feeRows.releaseFreeWho') : t('pricing.feeRows.releaseWho'),
    },
    { label: t('pricing.feeRows.fx'), rate: t('pricing.feeRows.fxRate', { pct: pct(fees.fxMarginPct) }), who: t('pricing.feeRows.fxWho') },
    { label: t('pricing.feeRows.minWithdrawal'), rate: t('pricing.feeRows.minWithdrawalRate', { amount: fees.minWithdrawalUsd }), who: '-' },
  ];
  const faq = t.items<Faq>('pricing.faq');

  return (
    <>
      {/* Page hero */}
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner">
          <Breadcrumbs lang={lang} trail={[{ label: t('pricing.crumb') }]} />
          <p className="q-eyebrow q-eyebrow--light">{t('pricing.eyebrow')}</p>
          <h1 className="q-h1 q-pagehero__title">{t('pricing.title')}</h1>
          <p className="q-pagehero__text">{t('pricing.text', { pct: pct(fees.buyerPct) })}</p>
        </div>
      </section>

      {/* Fee calculator */}
      <section className="q-section q-section--lg q-section--tint2 q-reveal">
        <div className="q-container q-split">
          <div>
            <h2 className="q-h3">{t('home.calc.title')}</h2>
            <p className="q-body q-mt-16 q-measure-sm">{t('home.calc.text')}</p>
            <Link className="q-btn q-btn--primary q-btn--sm q-mt-24" href={SITE.signupUrl}>
              {t('pricing.calcCta')}
            </Link>
          </div>
          <FeeCalculator fees={fees} lang={lang} t={t} />
        </div>
      </section>

      {/* Fees by amount and rail */}
      <section className="q-section q-section--tint q-reveal">
        <div className="q-container">
          <h2 className="q-h3 q-mb-24">{t('pricing.tableTitle')}</h2>

          <div className="q-table-wrap">
            <table className="q-table">
              <thead>
                <tr>
                  <th>{t('pricing.colFee')}</th>
                  <th>{t('pricing.colRate')}</th>
                  <th>{t('pricing.colWho')}</th>
                </tr>
              </thead>
              <tbody>
                {feeRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td><strong>{row.rate}</strong></td>
                    <td>{row.who}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="q-help-text q-mt-16">{t('pricing.tableNote')}</p>
        </div>
      </section>

      {/* What 2.5% buys you */}
      <section className="q-section q-section--lg q-reveal">
        <div className="q-container">
          <h2 className="q-h3 q-mb-32">{t('pricing.plansTitle', { pct: pct(fees.buyerPct) })}</h2>

          <div className="q-plans">
            <div className="q-card q-plan">
              <h3 className="q-h5">{t('pricing.planDirect.title')}</h3>
              <p className="q-plan__price">{t('pricing.planDirect.price')}</p>
              <p className="q-card__text">{t('pricing.planDirect.text')}</p>
            </div>
            <div className="q-card q-plan q-plan--featured">
              <span className="q-badge q-badge--blue q-plan__badge">{t('pricing.planBizik.badge')}</span>
              <h3 className="q-h5">{t('pricing.planBizik.title')}</h3>
              <p className="q-plan__price">{pct(fees.buyerPct)}{lang === 'fr' ? ' %' : '%'}</p>
              <p className="q-card__text">{t('pricing.planBizik.text')}</p>
              <Link className="q-btn q-btn--primary q-btn--sm q-btn--block" href={SITE.signupUrl}>
                {t('pricing.planBizik.cta')}
              </Link>
            </div>
            <div className="q-card q-plan">
              <h3 className="q-h5">{t('pricing.planTraditional.title')}</h3>
              <p className="q-plan__price">
                {t('pricing.planTraditional.price')}<span className="q-plan__per">{t('pricing.planTraditional.per')}</span>
              </p>
              <p className="q-card__text">{t('pricing.planTraditional.text')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Fee questions */}
      <section className="q-section q-section--tint2 q-reveal">
        <div className="q-container q-split q-split--wide-left" style={{ alignItems: 'start' }}>
          <h2 className="q-h3">{t('pricing.faqTitle')}</h2>
          <div className="q-faq">
            {faq.map((item, index) => (
              <div className="q-faq__item" key={item.q}>
                <h3>
                  <button className="q-faq__q" type="button" aria-expanded="false" aria-controls={`q-price-faq-${index}`}>
                    <span>{item.q}</span>
                    <span className="q-faq__icon" aria-hidden="true">+</span>
                  </button>
                </h3>
                <div className="q-faq__a" id={`q-price-faq-${index}`} role="region"><div><p>{item.a}</p></div></div>
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
