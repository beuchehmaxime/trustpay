import type { Metadata } from 'next';
import Link from 'next/link';

import { formatPct, loadFees } from './data';
import { Icon } from './Icon';
import { BreadcrumbJsonLd, FaqJsonLd } from './JsonLd';
import { SITE } from './site';
import { Breadcrumbs } from './shared';
import { alternatesFor, getTranslator, localeHref, type Lang } from './i18n';

/**
 * The two wallet landing pages, /send-money and /receive-money. They share one
 * layout (hero with a transfer card, facts, steps, detail, transfer-vs-escrow
 * table, FAQ, related links) and differ only in copy, which lives under
 * `marketing.sendMoney` / `marketing.receiveMoney` in the locale files.
 *
 * The copy may only state what the wallet really does: free and instant
 * wallet-to-wallet transfers by @handle or phone, recipient must have an
 * account, sender must be verified, no request-money, links, QR or cards.
 */
export type MoneyPageKind = 'sendMoney' | 'receiveMoney';

const PATHS: Record<MoneyPageKind, string> = {
  sendMoney: '/send-money',
  receiveMoney: '/receive-money',
};

const FACT_ICONS: Record<MoneyPageKind, string[]> = {
  sendMoney: ['wallet', 'bolt', 'users', 'lock'],
  receiveMoney: ['wallet', 'bolt', 'shield', 'id'],
};

interface CardItem { title: string; text: string }
interface FaqItem { q: string; a: string }
interface RelatedItem { title: string; text: string; href: string }

export async function moneyMetadata(kind: MoneyPageKind, lang: Lang): Promise<Metadata> {
  const t = getTranslator(lang);
  const path = PATHS[kind];
  return {
    title: t(`${kind}.meta.title`),
    description: t(`${kind}.meta.description`),
    alternates: alternatesFor(lang, path),
    openGraph: {
      title: t(`${kind}.meta.title`),
      description: t(`${kind}.meta.description`),
      url: localeHref(lang, path),
      type: 'website',
    },
  };
}

function TransferCard({ kind, t }: { kind: MoneyPageKind; t: ReturnType<typeof getTranslator> }) {
  if (kind === 'sendMoney') {
    return (
      <div className="q-calc q-money-card" aria-hidden="true">
        <p className="q-calc__label">{t('sendMoney.mock.label')}</p>
        <p className="q-money-card__who"><Icon name="users" size={16} /> {t('sendMoney.mock.recipient')}</p>
        <div className="q-calc__rows">
          <div className="q-calc__row"><span>{t('sendMoney.mock.amount')}</span><span>25,000 XAF</span></div>
          <div className="q-calc__row"><span>{t('sendMoney.mock.fee')}</span><span>{t('sendMoney.mock.feeValue')}</span></div>
          <div className="q-calc__row q-calc__row--total"><span>{t('sendMoney.mock.arrives')}</span><span>{t('sendMoney.mock.arrivesValue')}</span></div>
        </div>
        <p className="q-money-card__note"><Icon name="check" size={14} /> {t('sendMoney.mock.confirmed')}</p>
      </div>
    );
  }
  return (
    <div className="q-calc q-money-card" aria-hidden="true">
      <p className="q-calc__label">{t('receiveMoney.mock.label')}</p>
      <div className="q-calc__rows">
        <div className="q-calc__row"><span>{t('receiveMoney.mock.from')}</span><span>{t('receiveMoney.mock.fromValue')}</span></div>
        <div className="q-calc__row"><span>{t('receiveMoney.mock.fee')}</span><span>{t('receiveMoney.mock.feeValue')}</span></div>
        <div className="q-calc__row q-calc__row--total"><span>{t('receiveMoney.mock.amount')}</span><span>+ 40,000 XAF</span></div>
      </div>
      <div className="q-money-card__handle">
        <span>{t('receiveMoney.mock.handleLabel')}</span>
        <b>{t('receiveMoney.mock.handleValue')}</b>
        <i>{t('receiveMoney.mock.share')}</i>
      </div>
    </div>
  );
}

export async function MoneyLanding({ kind, lang }: { kind: MoneyPageKind; lang: Lang }) {
  const t = getTranslator(lang);
  const href = (path: string) => localeHref(lang, path);
  const fees = await loadFees();
  const otherPath = kind === 'sendMoney' ? PATHS.receiveMoney : PATHS.sendMoney;
  const facts = t.items<CardItem>(`${kind}.facts`);
  const steps = t.items<CardItem>(`${kind}.steps`);
  const details = t.items<CardItem>(`${kind}.details`);
  const compareCols = t.items<string>(`${kind}.compareCols`);
  const compareRows = t.items<string[]>(`${kind}.compareRows`);
  const faq = t.items<FaqItem>(`${kind}.faq`);
  const related = t.items<RelatedItem>(`${kind}.related`);
  const fxPct = formatPct(fees.fxMarginPct, lang);
  const trail = [{ label: t(`${kind}.crumb`) }];

  return (
    <>
      <BreadcrumbJsonLd lang={lang} trail={[{ label: t(`${kind}.crumb`), href: PATHS[kind] }]} />
      <FaqJsonLd items={faq} />

      {/* Hero */}
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner q-split">
          <div>
            <Breadcrumbs lang={lang} trail={trail} />
            <p className="q-eyebrow q-eyebrow--light">{t(`${kind}.eyebrow`)}</p>
            <h1 className="q-h1 q-pagehero__title">{t(`${kind}.title`)}</h1>
            <p className="q-pagehero__text">{t(`${kind}.text`)}</p>
            <div className="q-pagehero__cta">
              <Link className="q-btn q-btn--primary" href={SITE.signupUrl}>{t(`${kind}.ctaPrimary`)}</Link>
              <Link className="q-btn q-btn--ghost-light" href={href(otherPath)}>{t(`${kind}.ctaSecondary`)}</Link>
            </div>
          </div>
          <TransferCard kind={kind} t={t} />
        </div>
      </section>

      {/* Facts */}
      <section className="q-section q-reveal">
        <div className="q-container">
          <h2 className="q-h3 q-mb-32">{t(`${kind}.factsTitle`)}</h2>
          <div className="q-grid q-grid--4">
            {facts.map((fact, index) => (
              <div key={fact.title}>
                <span className="q-icon-tile"><Icon name={FACT_ICONS[kind][index] ?? 'check'} size={20} /></span>
                <h3 className="q-card__title q-mt-16">{fact.title}</h3>
                <p className="q-card__text q-mt-8">{fact.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="q-section q-section--tint q-reveal">
        <div className="q-container">
          <div className="q-sechead">
            <div className="q-sechead__text">
              <p className="q-eyebrow">{t(`${kind}.stepsEyebrow`)}</p>
              <h2 className="q-h2 q-sechead__title">{t(`${kind}.stepsTitle`)}</h2>
            </div>
          </div>
          <ol className="q-grid q-grid--3 q-money-steps">
            {steps.map((step, index) => (
              <li className="q-card q-card--pad-lg" key={step.title}>
                <span className="q-money-steps__num">{index + 1}</span>
                <h3 className="q-card__title q-mt-16">{step.title}</h3>
                <p className="q-card__text q-mt-12">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Detail */}
      <section className="q-section q-section--lg q-reveal">
        <div className="q-container q-split q-split--wide-left" style={{ alignItems: 'start' }}>
          <h2 className="q-h3">{t(`${kind}.detailTitle`)}</h2>
          <div className="q-money-details">
            {details.map((detail) => (
              <div key={detail.title}>
                <h3 className="q-h5">{detail.title}</h3>
                <p className="q-body q-mt-8">{detail.text.replace('{{fxPct}}', fxPct)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transfer or escrow */}
      <section className="q-section q-section--tint2 q-reveal">
        <div className="q-container">
          <h2 className="q-h3">{t(`${kind}.compareTitle`)}</h2>
          <p className="q-body q-mt-16 q-measure">{t(`${kind}.compareText`)}</p>
          <div className="q-table-wrap q-mt-24">
            <table className="q-table q-table--stack">
              <thead>
                <tr>
                  {compareCols.map((column, index) => (
                    <th key={index} scope="col">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row[0]}>
                    <th scope="row">{row[0]}</th>
                    <td data-label={compareCols[1]}>{row[1]}</td>
                    <td data-label={compareCols[2]}>{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link
            className="q-btn q-btn--primary q-btn--sm q-mt-24"
            href={href(kind === 'sendMoney' ? '/how-it-works' : '/for-business')}
          >
            {t(`${kind}.compareCta`)}
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="q-section q-reveal">
        <div className="q-container q-split q-split--wide-left" style={{ alignItems: 'start' }}>
          <h2 className="q-h3">{t(`${kind}.faqTitle`)}</h2>
          <div className="q-faq">
            {faq.map((item, index) => (
              <div className="q-faq__item" key={item.q}>
                <h3>
                  <button className="q-faq__q" type="button" aria-expanded="false" aria-controls={`q-money-faq-${index}`}>
                    <span>{item.q}</span>
                    <span className="q-faq__icon" aria-hidden="true">+</span>
                  </button>
                </h3>
                <div className="q-faq__a" id={`q-money-faq-${index}`} role="region"><div><p>{item.a}</p></div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="q-section q-section--tint q-reveal">
        <div className="q-container">
          <h2 className="q-h4 q-mb-24">{t(`${kind}.relatedTitle`)}</h2>
          <div className="q-grid q-grid--3">
            {related.map((item) => (
              <Link className="q-card q-card--hover" href={href(item.href)} key={item.href}>
                <h3 className="q-card__title">{item.title}</h3>
                <p className="q-card__text q-mt-8">{item.text}</p>
              </Link>
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
