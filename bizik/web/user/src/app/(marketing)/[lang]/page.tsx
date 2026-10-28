import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/app/(marketing)/_bizik/Icon';
import { SITE } from '@/app/(marketing)/_bizik/site';
import { FaqJsonLd } from '@/app/(marketing)/_bizik/JsonLd';
import { FeeCalculator } from '@/app/(marketing)/_bizik/FeeCalculator';
import { loadFees } from '@/app/(marketing)/_bizik/data';
import { alternatesFor, getTranslator, localeHref, toLang, type Lang } from '@/app/(marketing)/_bizik/i18n';

const IMG = '/marketing/images';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return {
    title: { absolute: t('home.meta.title') },
    description: t('home.meta.description'),
    alternates: alternatesFor(lang, '/'),
    openGraph: {
      title: t('home.meta.ogTitle'),
      description: t('home.meta.ogDescription'),
      url: localeHref(lang, '/'),
      type: 'website',
    },
  };
}

interface StepItem { n: string; title: string; text: string }
interface CardItem { title: string; text: string }
interface UseCaseItem { alt: string; title: string; text: string }
interface QuoteItem { text: string; name: string; role: string }
interface FaqItem { q: string; a: string }

/** Icons and artwork are fixed; only the words change per language. */
const WHY_ICONS = ['mobile', 'lock', 'scale', 'refresh', 'whatsapp', 'convert'];
const WHATSAPP_ICONS = ['mic', 'lock', 'send', 'id'];
const USECASE_IMAGES = ['freelancers.webp', 'buyamsellams.webp', 'carbuyer.webp', 'diasporacaller.webp', 'shoponline.webp'];
const USECASE_LINKS: (string | null)[] = ['/for-freelancers', null, null, null, '/for-business'];
const QUOTE_AVATARS = ['AN', 'ET', 'SM'];
// Each language links straight to its own version of the article (the slugs
// differ), so a French reader never bounces through a redirect.
const TEASER_SLUGS: Record<Lang, string[]> = {
  en: [
    '/blog/the-fake-delivery-agent-is-back-what-to-watch-for',
    '/blog/what-is-escrow-in-plain-language',
    '/blog/freelancers-how-to-make-sure-you-always-get-paid',
  ],
  fr: [
    '/blog/faux-livreur-arnaque-comment-la-reconnaitre',
    '/blog/qu-est-ce-que-le-sequestre-explique-simplement',
    '/blog/freelances-comment-etre-toujours-paye',
  ],
};

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  const href = (path: string) => localeHref(lang, path);
  const fees = await loadFees();
  const teaserSlugs = TEASER_SLUGS[lang];

  const steps = t.items<StepItem>('home.steps.items');
  const whyItems = t.items<CardItem>('home.why.items');
  const whatsappRows = t.items<CardItem>('home.whatsapp.rows');
  const useCases = t.items<UseCaseItem>('home.useCases.items');
  const protections = t.items<CardItem>('home.protection.items');
  const quotes = t.items<QuoteItem>('home.proof.quotes');
  const faq = t.items<FaqItem>('home.faq.items');
  const teasers = t.items<{ tag: string; title: string; excerpt: string; meta: string }>('home.blog.teasers');

  return (
    <>
      <FaqJsonLd items={faq} />

    <>
      {/* Hero */}
      <section className="q-hero q-on-dark">
        <div className="q-container q-hero__inner">
          <div className="q-hero__copy q-reveal">
            <span className="q-badge q-badge--new">
              <span className="q-badge__dot">{t('home.hero.badgeDot')}</span>
              {t('home.hero.badge')}
            </span>
            <h1 className="q-h1 q-hero__title">
              <span className="q-hero__lead">{t('home.hero.titleLead')}</span>{' '}
              <span className="q-hero__accent">{t('home.hero.titleAccent')}</span>
            </h1>
            <p className="q-hero__text">{t('home.hero.text')}</p>
            <div className="q-hero__cta">
              <a className="q-btn q-btn--whatsapp q-btn--lg" href={SITE.whatsappUrl} target="_blank" rel="noopener">
                <Icon name="whatsapp" size={22} />
                {t('chrome.startOnWhatsApp')}
              </a>
              <Link className="q-btn q-btn--ghost-light q-btn--lg" href={SITE.signupUrl}>
                {t('chrome.getStarted')}
              </Link>
            </div>
            <div className="q-trustline">
              <span className="q-trustline__item"><Icon name="lock" size={17} />{t('home.hero.trustFunds')}</span>
              <span className="q-trustline__item"><Icon name="globe" size={17} />{t('home.hero.trustCameroon')}</span>
              <span className="q-trustline__item"><Icon name="scale" size={17} />{t('home.hero.trustDisputes')}</span>
            </div>
            <div className="q-hero__stats">
              <div className="q-stat"><p className="q-stat__value">1.4B <span className="q-stat__unit">XAF</span></p><p className="q-stat__label">{t('home.hero.statHeldLabel')}</p></div>
              <div className="q-stat"><p className="q-stat__value">{t('home.hero.statDealsValue')}</p><p className="q-stat__label">{t('home.hero.statDealsLabel')}</p></div>
              <div className="q-stat"><p className="q-stat__value">{t('home.hero.statRulingValue')}</p><p className="q-stat__label">{t('home.hero.statRulingLabel')}</p></div>
            </div>
          </div>

          <div className="q-hero__visual q-reveal">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="q-hero__img" src={`${IMG}/hero-app.webp`} alt={t('home.hero.imgAlt')} width={1445} height={1089} loading="eager" fetchPriority="high" />
            <div className="q-float q-float--ussd" aria-hidden="true">
              <div className="q-float__brands">
                <span className="q-brandchip q-brandchip--mtn">MTN</span>
                <span className="q-brandchip q-brandchip--om">OM</span>
                <span className="q-float__title">{t('home.hero.ussdTitle')}</span>
              </div>
              <p dangerouslySetInnerHTML={{ __html: t('home.hero.ussdText') }} />
            </div>
            <div className="q-float q-float--chat" aria-hidden="true">
              <div className="q-chat__bar"><Icon name="whatsapp" size={16} /><span>{t('home.hero.chatBar')}</span></div>
              <div className="q-chat__body">
                <p className="q-chat__bubble">{t('home.hero.chatHeld')} <strong>450,000 XAF</strong></p>
                <p className="q-chat__bubble">{t('home.hero.chatDelivered')} <strong className="q-chat__ok">{t('home.hero.chatPaid')} ✓</strong></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Payment rail */}
      <div className="q-rail">
        <div className="q-container q-rail__inner">
          <span className="q-rail__label">{t('home.rail.label')}</span>
          <div className="q-rail__logos">
            {/* eslint-disable @next/next/no-img-element */}
            <span className="q-rail__logo"><img className="q-rail__icon" src={`${IMG}/mtn-momo-mobile-money-uganda-logo-png_seeklogo-556395.png`} alt="" width={28} height={28} loading="lazy" /> MTN MoMo</span>
            <span className="q-rail__logo"><img className="q-rail__icon" src={`${IMG}/IMG-20220708-WA0025.jpg`} alt="" width={28} height={28} loading="lazy" /> Orange Money</span>
            <span className="q-rail__logo"><img className="q-rail__icon" src={`${IMG}/visa-logo-png_seeklogo-149684.png`} alt="" width={28} height={28} loading="lazy" /> VISA</span>
            <span className="q-rail__logo"><img className="q-rail__icon" src={`${IMG}/Mastercard_logo.webp`} alt="" width={28} height={28} loading="lazy" /> Mastercard</span>
            {/* eslint-enable @next/next/no-img-element */}
          </div>
          <span className="q-rail__note">{t('home.rail.note')}</span>
        </div>
      </div>

      {/* Steps */}
      <section className="q-section q-reveal">
        <div className="q-container">
          <div className="q-sechead">
            <div className="q-sechead__text">
              <p className="q-eyebrow">{t('home.steps.eyebrow')}</p>
              <h2 className="q-h2 q-sechead__title">{t('home.steps.title')}</h2>
            </div>
            <Link className="q-btn q-btn--white q-btn--sm" href={href('/how-it-works')}>{t('home.steps.cta')}</Link>
          </div>
          <div className="q-steps">
            {steps.map((step, index) => (
              <div className={`q-card q-step${index === steps.length - 1 ? ' q-card--blue' : ''}`} key={step.n}>
                <span className="q-step-num">{step.n}</span>
                <h3 className="q-card__title">{step.title}</h3>
                <p className="q-card__text">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WhatsApp assistant */}
      <section className="q-section q-section--lg q-whatsapp q-on-dark q-reveal">
        <div className="q-container q-whatsapp__inner">
          <div>
            <span className="q-badge">{t('home.whatsapp.badge')}</span>
            <h2 className="q-h2 q-mt-20">{t('home.whatsapp.title')}</h2>
            <p className="q-lead q-mt-16 q-measure">{t('home.whatsapp.text')}</p>
            <div className="q-featlist q-mt-32">
              {whatsappRows.map((row, index) => (
                <div className="q-featrow" key={row.title}>
                  <span className="q-icon-tile q-icon-tile--sm"><Icon name={WHATSAPP_ICONS[index]} size={17} /></span>
                  <div>
                    <p className="q-featrow__title">{row.title}</p>
                    <p className="q-featrow__text">{row.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <a className="q-btn q-btn--whatsapp q-mt-32" href={SITE.whatsappUrl} target="_blank" rel="noopener">
              <Icon name="whatsapp" size={20} />
              {t('home.whatsapp.cta')}
            </a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="q-whatsapp__img" src={`${IMG}/0d1305dd-598d-44a4-a319-5f69e5a98904.webp`} alt={t('home.whatsapp.imgAlt')} loading="lazy" />
        </div>
      </section>

      {/* Dashboard mockup */}
      <section className="q-section q-section--lg q-section--tint q-reveal">
        <div className="q-container">
          <div className="q-sechead q-sechead--center">
            <div className="q-sechead__text q-center">
              <p className="q-eyebrow">{t('home.product.eyebrow')}</p>
              <h2 className="q-h2 q-sechead__title">{t('home.product.title')}</h2>
              <p className="q-lead q-sechead__sub">{t('home.product.sub')}</p>
            </div>
          </div>
          <div className="q-browser" aria-hidden="true">
            <div className="q-browser__bar">
              <span className="q-browser__dot" style={{ background: '#FF5F57' }} />
              <span className="q-browser__dot" style={{ background: '#FEBC2E' }} />
              <span className="q-browser__dot" style={{ background: '#28C840' }} />
              <span className="q-browser__url">bizik.cm</span>
            </div>
            <div className="q-app">
              <aside className="q-app__side">
                <div className="q-app__brand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="q-app__logo" src="/brand/logo-icon.png" alt="" width={2068} height={2938} />
                  <b>Bizik</b>
                </div>
                <span className="q-app__new">{t('home.mockup.newDeal')}</span>
                <p className="q-app__group">{t('home.mockup.groupOverview')}</p>
                <span className="q-app__link is-active"><Icon name="dashboard" size={14} />{t('home.mockup.dashboard')}</span>
                <p className="q-app__group">{t('home.mockup.groupMoney')}</p>
                <span className="q-app__link"><Icon name="wallet" size={14} />{t('home.mockup.wallet')}</span>
                <span className="q-app__link"><Icon name="plus" size={14} />{t('home.mockup.addMoney')}</span>
                <span className="q-app__link"><Icon name="withdraw" size={14} />{t('home.mockup.withdraw')}</span>
                <span className="q-app__link"><Icon name="convert" size={14} />{t('home.mockup.convert')}</span>
                <span className="q-app__link"><Icon name="file" size={14} />{t('home.mockup.transactions')}</span>
                <p className="q-app__group">{t('home.mockup.groupWork')}</p>
                <span className="q-app__link"><Icon name="briefcase" size={14} />{t('home.mockup.deals')}<em>2</em></span>
                <span className="q-app__link"><Icon name="scale" size={14} />{t('home.mockup.disputes')}<em className="is-red">1</em></span>
                <div className="q-app__user">
                  <span className="q-app__avatar">AO</span>
                  <span><b>Ada Okafor</b><i>+237 6 77 41 99 02</i></span>
                </div>
              </aside>
              <div className="q-app__main">
                <div className="q-app__top">
                  <div><p className="q-app__crumb">{t('home.mockup.groupOverview')}</p><p className="q-app__title">{t('home.mockup.dashboard')}</p></div>
                  <p className="q-app__balance">1,875,000.00 <span>XAF</span></p>
                </div>
                <div className="q-app__tiles">
                  <div className="q-app__tile q-app__tile--blue"><p className="q-app__tile-label"><Icon name="wallet" size={12} />{t('home.mockup.walletBalance')}</p><p className="q-app__tile-value">1,875,000 XAF</p><p className="q-app__tile-meta">≈ $3,125.00</p></div>
                  <div className="q-app__tile"><p className="q-app__tile-label"><Icon name="lock" size={12} />{t('home.mockup.inEscrow')}</p><p className="q-app__tile-value">1,950,000 XAF</p><p className="q-app__tile-meta">{t('home.mockup.escrowDeals')}</p></div>
                  <div className="q-app__tile"><p className="q-app__tile-label"><Icon name="dashboard" size={12} />{t('home.mockup.activeDeals')}</p><p className="q-app__tile-value">3</p><p className="q-app__tile-meta">{t('home.mockup.activeMeta')}</p></div>
                  <div className="q-app__tile"><p className="q-app__tile-label"><Icon name="check" size={12} />{t('home.mockup.completed')}</p><p className="q-app__tile-value">12</p><p className="q-app__tile-meta">{t('home.mockup.completedMeta')}</p></div>
                </div>
                <p className="q-app__section">{t('home.mockup.attention')} <span className="q-wallet__count">3</span></p>
                <div className="q-app__attention">
                  <div className="q-app__att"><span className="q-tag q-badge--amber">{t('home.mockup.tagAwaiting')}</span><p className="q-app__att-title">{t('home.mockup.dealLamps')}</p><p className="q-app__att-meta">{t('home.mockup.metaTo', { name: 'Li Wei' })} · 470,000 XAF</p><p className="q-app__att-next">{t('home.mockup.nextFund', { name: 'Li Wei' })}</p><span className="q-app__att-btn q-app__att-btn--blue">{t('home.mockup.btnFund')}</span></div>
                  <div className="q-app__att"><span className="q-tag q-badge--green">{t('home.mockup.tagSubmitted')}</span><p className="q-app__att-title">{t('home.mockup.dealBrand')}</p><p className="q-app__att-meta">Kwame Mensah · 300,000 XAF</p><p className="q-app__att-next">{t('home.mockup.nextReview', { amount: '300,000 XAF' })}</p><span className="q-app__att-btn q-app__att-btn--green">{t('home.mockup.btnApprove')}</span></div>
                  <div className="q-app__att"><span className="q-tag q-badge--red">{t('home.mockup.tagUnderReview')}</span><p className="q-app__att-title">{t('home.mockup.dealDispute')}</p><p className="q-app__att-meta">{t('home.mockup.metaMilestone')} · 230,000 XAF</p><p className="q-app__att-next">{t('home.mockup.nextEvidence')}</p><span className="q-app__att-btn q-app__att-btn--outline">{t('home.mockup.btnEvidence')}</span></div>
                </div>
                <div className="q-app__bottom">
                  <div className="q-app__panel">
                    <p className="q-app__panel-head">{t('home.mockup.panelActive')} <i>{t('home.mockup.seeAll')}</i></p>
                    <table className="q-app__table">
                      <thead>
                        <tr><th>{t('home.mockup.colDeal')}</th><th>{t('home.mockup.colValue')}</th><th>{t('home.mockup.colStatus')}</th><th>{t('home.mockup.colNext')}</th></tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="q-app__initials">KM</span><span><b>{t('home.mockup.dealBrand')}</b><i>Kwame Mensah</i></span></td>
                          <td>900,000 XAF</td>
                          <td><span className="q-tag q-badge--blue">{t('home.mockup.statusInProgress')}</span></td>
                          <td>{t('home.mockup.nextApproveMilestone')}</td>
                        </tr>
                        <tr>
                          <td><span className="q-app__initials">LW</span><span><b>{t('home.mockup.dealLamps')}</b><i>Li Wei</i></span></td>
                          <td>470,000 XAF</td>
                          <td><span className="q-tag q-badge--amber">{t('home.mockup.statusAwaiting')}</span></td>
                          <td>{t('home.mockup.nextFundEscrow')}</td>
                        </tr>
                        <tr>
                          <td><span className="q-app__initials">AB</span><span><b>{t('home.mockup.dealPhotography')}</b><i>Amina Bello · {t('home.mockup.youGetPaid')}</i></span></td>
                          <td>350,000 XAF</td>
                          <td><span className="q-tag q-badge--grey">{t('home.mockup.statusInReview')}</span></td>
                          <td>{t('home.mockup.nextWaiting')}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="q-app__panel">
                    <p className="q-app__panel-head">{t('home.mockup.panelEscrowBy')}</p>
                    <div className="q-app__donut-row">
                      <span className="q-app__donut" />
                      <ul className="q-app__legend">
                        <li><i style={{ background: '#2563EB' }} />{t('home.mockup.legendBrand')} <b>46%</b></li>
                        <li><i style={{ background: '#16A34A' }} />{t('home.mockup.legendLamps')} <b>24%</b></li>
                        <li><i style={{ background: '#F59E0B' }} />{t('home.mockup.legendPhoto')} <b>18%</b></li>
                        <li><i style={{ background: '#BBD5F0' }} />{t('home.mockup.legendOther')} <b>12%</b></li>
                      </ul>
                    </div>
                    <p className="q-app__panel-head q-mt-16">{t('home.mockup.panelActivity')} <i>{t('home.mockup.seeAll')}</i></p>
                    <ul className="q-app__activity">
                      <li><span className="q-app__dot q-app__dot--ok" /><span><b>{t('home.mockup.actSubmitted')}</b><i>Kwame Mensah · {t('home.mockup.agoHours', { count: 2 })}</i></span></li>
                      <li><span className="q-app__dot q-app__dot--warn" /><span><b>{t('home.mockup.actEvidence')}</b><i>#D-2041 · {t('home.mockup.agoDay')}</i></span></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="q-trustline q-mt-24" style={{ justifyContent: 'center' }}>
            <span className="q-trustline__item q-small"><Icon name="mobile" size={16} />{t('home.product.trustSameAccount')}</span>
            <span className="q-trustline__item q-small"><Icon name="withdraw" size={16} />{t('home.product.trustInstallable')}</span>
            <span className="q-trustline__item q-small"><Icon name="clock" size={16} />{t('home.product.trustNextStep')}</span>
          </div>
        </div>
      </section>

      {/* Why Bizik */}
      <section className="q-section q-section--lg q-section--tint2 q-reveal">
        <div className="q-container">
          <div className="q-sechead">
            <div className="q-sechead__text">
              <h2 className="q-h2">{t('home.why.title')}</h2>
              <p className="q-body q-sechead__sub q-measure-sm">{t('home.why.sub')}</p>
            </div>
          </div>
          <div className="q-featcards">
            {whyItems.map((feature, index) => (
              <div className="q-card q-card--hover" key={feature.title}>
                <span className="q-icon-tile"><Icon name={WHY_ICONS[index]} size={20} /></span>
                <h3 className="q-card__title q-mt-16">{feature.title}</h3>
                <p className="q-card__text q-mt-8">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="q-section q-section--lg q-reveal">
        <div className="q-container">
          <div className="q-sechead"><div className="q-sechead__text"><h2 className="q-h2">{t('home.useCases.title')}</h2></div></div>
          <div className="q-usecases">
            {useCases.map((useCase, index) => {
              const inner = (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <div className="q-photo"><img src={`${IMG}/${USECASE_IMAGES[index]}`} alt={useCase.alt} loading="lazy" /></div>
                  <div className="q-usecase__body">
                    <h3 className="q-usecase__title">{useCase.title}</h3>
                    <p className="q-usecase__text">{useCase.text}</p>
                  </div>
                </>
              );
              const link = USECASE_LINKS[index];
              return link ? (
                <Link className="q-card q-card--flush q-card--hover q-usecase" href={href(link)} key={useCase.title}>{inner}</Link>
              ) : (
                <div className="q-card q-card--flush q-card--hover q-usecase" key={useCase.title}>{inner}</div>
              );
            })}
            <div className="q-card q-card--navy q-usecase" style={{ justifyContent: 'space-between' }}>
              <div className="q-usecase__body">
                <h3 className="q-h4">{t('home.useCases.cardTitle')}</h3>
                <Link className="q-btn q-btn--solid-white q-btn--sm q-mt-24" href={SITE.signupUrl}>{t('home.useCases.cardCta')}</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Protection */}
      <section className="q-section q-section--lg q-section--navy q-on-dark q-reveal">
        <div className="q-container q-protect">
          <div>
            <p className="q-eyebrow q-eyebrow--light">{t('home.protection.eyebrow')}</p>
            <h2 className="q-h2 q-mt-12">{t('home.protection.title')}</h2>
            <p className="q-body q-mt-16 q-measure-sm">{t('home.protection.text')}</p>
            <Link className="q-btn q-btn--solid-white q-btn--sm q-mt-24" href={href('/security')}>{t('home.protection.cta')}</Link>
          </div>
          <div className="q-protect__list">
            {protections.map((item) => (
              <div className="q-panel" key={item.title}>
                <p className="q-featrow__title">{item.title}</p>
                <p className="q-featrow__text">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="q-section q-reveal">
        <div className="q-container">
          <div className="q-grid q-grid--3 q-mb-40">
            <div className="q-stat q-stat--ruled"><p className="q-stat__value">1.4B <span className="q-stat__unit">XAF</span></p><p className="q-stat__label">{t('home.proof.statHeldLabel')}</p></div>
            <div className="q-stat q-stat--ruled"><p className="q-stat__value">{t('home.hero.statDealsValue')}</p><p className="q-stat__label">{t('home.proof.statDealsLabel')}</p></div>
            <div className="q-stat q-stat--ruled q-stat--ruled-green"><p className="q-stat__value">{t('home.hero.statRulingValue')}</p><p className="q-stat__label">{t('home.proof.statRulingLabel')}</p></div>
          </div>
          <div className="q-quotes">
            {quotes.map((quote, index) => (
              <figure className="q-card q-card--tint" key={quote.name}>
                <blockquote className="q-quote__text">&ldquo;{quote.text}&rdquo;</blockquote>
                <figcaption className="q-quote__who">
                  <span className="q-quote__avatar">{QUOTE_AVATARS[index]}</span>
                  <span><span className="q-quote__name">{quote.name}</span><br /><span className="q-quote__role">{quote.role}</span></span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Fee calculator */}
      <section className="q-section q-section--lg q-section--tint2 q-reveal">
        <div className="q-container q-split">
          <div>
            <h2 className="q-h3">{t('home.calc.title')}</h2>
            <p className="q-body q-mt-16 q-measure-sm">{t('home.calc.text')}</p>
            <Link className="q-btn q-btn--primary q-btn--sm q-mt-24" href={href('/pricing')}>{t('home.calc.cta')}</Link>
          </div>
          <FeeCalculator fees={fees} lang={lang} t={t} />
        </div>
      </section>

      {/* Blog teasers */}
      <section className="q-section q-section--lg q-section--tint q-reveal">
        <div className="q-container">
          <div className="q-sechead">
            <div className="q-sechead__text">
              <p className="q-eyebrow">{t('home.blog.eyebrow')}</p>
              <h2 className="q-h2 q-sechead__title">{t('home.blog.title')}</h2>
            </div>
            <Link className="q-btn q-btn--white q-btn--sm" href={href('/blog')}>{t('home.blog.cta')}</Link>
          </div>
          <div className="q-postgrid q-postgrid--feature">
            {teasers.map((post, index) => (
              <Link className={`q-post${index === 0 ? ' q-post--lg' : ''}`} href={href(teaserSlugs[index])} key={teaserSlugs[index]}>
                {index === 0 && <div className="q-photo"><span>{t('home.blog.photoPlaceholder')}</span></div>}
                <div className="q-post__body">
                  <span className="q-tag q-badge--blue" style={{ alignSelf: 'flex-start' }}>{post.tag}</span>
                  <h3 className="q-post__title">{post.title}</h3>
                  <p className="q-post__excerpt">{post.excerpt}</p>
                  <p className="q-post__meta">{post.meta}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="q-section q-section--lg q-reveal">
        <div className="q-container q-split q-split--wide-left" style={{ alignItems: 'start' }}>
          <div>
            <h2 className="q-h3">{t('home.faq.title')}</h2>
            <p className="q-body q-mt-16 q-measure-sm">{t('home.faq.text')}</p>
            <Link className="q-link-arrow q-mt-16" href={href('/help-centre')}>{t('home.faq.cta')}</Link>
          </div>
          <div className="q-faq" data-faq-single>
            {faq.map((item, index) => (
              <div className="q-faq__item" key={item.q}>
                <h3>
                  <button className="q-faq__q" type="button" aria-expanded="false" aria-controls={`q-faq-${index}`}>
                    <span>{item.q}</span>
                    <span className="q-faq__icon" aria-hidden="true">+</span>
                  </button>
                </h3>
                <div className="q-faq__a" id={`q-faq-${index}`} role="region"><div><p>{item.a}</p></div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* App CTA */}
      <section className="q-section q-section--tight q-appband q-reveal">
        <div className="q-container">
          <div className="q-card q-card--pad-lg q-appcta">
            <div>
              <p className="q-eyebrow">{t('home.appCta.eyebrow')}</p>
              <h2 className="q-h3 q-mt-12">{t('home.appCta.title')}</h2>
              <p className="q-body q-mt-16">{t('home.appCta.text')}</p>
              <div className="q-row q-gap-12 q-row--wrap q-mt-24">
                <a className="q-store-badge" href={SITE.appStoreUrl}><Icon name="phone" size={20} />App Store</a>
                <a className="q-store-badge" href={SITE.playStoreUrl}><Icon name="arrow" size={20} />Google Play</a>
                {/* A real QR, generated for https://bizik.cm and verified to decode
                    back to it - what sat here before was a CSS checkerboard that
                    only looked like one. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="q-qr" src={`${IMG}/qr-bizik.svg`} alt={t('home.appCta.qrAlt')} width={160} height={160} loading="lazy" />
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="q-photo q-photo--wide"><img src={`${IMG}/promotional.webp`} alt={t('home.appCta.imgAlt')} width={500} height={500} loading="lazy" /></div>
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
              <Link className="q-btn q-btn--ghost-light" href={href('/contact')}>{t('home.closing.ctaSecondary')}</Link>
            </div>
          </div>
        </div>
      </section>
    </>
    </>
  );
}
