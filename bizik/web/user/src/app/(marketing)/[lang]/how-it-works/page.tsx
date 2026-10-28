import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/app/(marketing)/_bizik/Icon';
import { SITE } from '@/app/(marketing)/_bizik/site';
 import { alternatesFor, getTranslator, localeHref, toLang } from '@/app/(marketing)/_bizik/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return {
    title: t('howItWorks.meta.title'),
    description: t('howItWorks.meta.description'),
    alternates: alternatesFor(lang, '/how-it-works'),
    openGraph: {
      title: t('howItWorks.meta.title'),
      description: t('howItWorks.meta.description'),
      url: localeHref(lang, '/how-it-works'),
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

type StepMockup = 'new-deal' | 'fund' | 'milestones' | 'release';

interface StepBlock { num: string; title: string; text: string; label: string; note: string; cap: string }
interface DisputeStep { step: string; title: string; text: string }
interface Faq { q: string; a: string }

/** Layout, artwork and which side each block sits on are fixed; only words change. */
const STEP_MOCKUPS: StepMockup[] = ['new-deal', 'fund', 'milestones', 'release'];
const STEP_FLIP = [false, true, false, true];

function StepMockupBody({ mockup, t }: { mockup: StepMockup; t: ReturnType<typeof getTranslator> }) {
  if (mockup === 'new-deal') {
    return (
      <>
        <div className="q-mini__field"><i>{t('howItWorks.mockup.sellingLabel')}</i><b>{t('howItWorks.mockup.sellingValue')}</b></div>
        <div className="q-mini__grid">
          <div className="q-mini__field"><i>{t('howItWorks.mockup.amountLabel')}</i><b>450,000 XAF</b></div>
          <div className="q-mini__field"><i>{t('howItWorks.mockup.milestonesLabel')}</i><b>3</b></div>
        </div>
        <div className="q-mini__field"><i>{t('howItWorks.mockup.inviteLabel')}</i><b>+237 6•• ••• •••</b></div>
      </>
    );
  }

  if (mockup === 'fund') {
    return (
      <>
        <div className="q-mini__pays">
          <span className="is-active"><span className="q-brandchip q-brandchip--mtn">MTN</span> MoMo</span>
          <span><span className="q-brandchip q-brandchip--om">OM</span> Orange</span>
          <span><Icon name="wallet" size={13} /> {t('howItWorks.mockup.cardLabel')}</span>
        </div>
        <div className="q-mini__ussd">
          {t('howItWorks.mockup.ussd')}
        </div>
      </>
    );
  }

  if (mockup === 'milestones') {
    return (
      <ul className="q-mini__miles">
        <li><span className="q-mini__ms q-mini__ms--done"><CheckMark size={11} /></span><b>{t('howItWorks.mockup.ms1')}</b><i className="is-ok">{t('howItWorks.mockup.ms1State')}</i></li>
        <li><span className="q-mini__ms">2</span><b>{t('howItWorks.mockup.ms2')}</b><i className="is-blue">{t('howItWorks.mockup.ms2State')}</i></li>
        <li><span className="q-mini__ms">3</span><b>{t('howItWorks.mockup.ms3')}</b><i>{t('howItWorks.mockup.ms3State')}</i></li>
      </ul>
    );
  }

  return (
    <>
      <div className="q-mini__field"><i>{t('howItWorks.mockup.payingOut')}</i><b>Orange Money · +237 6•• ••• •••</b></div>
      <ul className="q-mini__rows">
        <li><span>{t('howItWorks.mockup.rowAmount')}</span><b>450,000 XAF</b></li>
        <li><span>{t('howItWorks.mockup.rowFee')}</span><b>0 XAF</b></li>
        <li className="is-total"><span>{t('howItWorks.mockup.rowReceive')}</span><b>450,000 XAF</b></li>
      </ul>
    </>
  );
}

export default async function HowItWorksPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  const steps = t.items<StepBlock>('howItWorks.steps');
  const disputeSteps = t.items<DisputeStep>('howItWorks.disputes.items');
  const faqs = t.items<Faq>('howItWorks.faq');

  return (
    <>
      {/* Page hero */}
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner">
          <nav className="q-crumbs" aria-label="Breadcrumb">
            <Link href={localeHref(lang, '/')}>{t('howItWorks.crumbHome')}</Link><span>/</span><span>{t('howItWorks.eyebrow')}</span>
          </nav>
          <p className="q-eyebrow q-eyebrow--light">{t('howItWorks.eyebrow')}</p>
          <h1 className="q-h1 q-pagehero__title">{t('howItWorks.title')}</h1>
          <p className="q-pagehero__text">{t('howItWorks.text')}</p>

          <div className="q-flow q-mt-40">
            <div className="q-flow__node">
              <span className="q-flow__dot" />
              <p className="q-flow__title">{t('howItWorks.flow.walletTitle')}</p>
              <p className="q-flow__meta">{t('howItWorks.flow.walletMeta')}</p>
            </div>
            <span className="q-flow__line" />
            <div className="q-flow__node">
              <span className="q-flow__dot q-flow__dot--lock"><Icon name="lock" size={13} /></span>
              <p className="q-flow__title">{t('howItWorks.flow.escrowTitle')}</p>
              <p className="q-flow__meta">{t('howItWorks.flow.escrowMeta')}</p>
            </div>
            <span className="q-flow__line" />
            <div className="q-flow__node">
              <span className="q-flow__dot q-flow__dot--ok"><CheckMark size={13} /></span>
              <p className="q-flow__title">{t('howItWorks.flow.releasedTitle')}</p>
              <p className="q-flow__meta">{t('howItWorks.flow.releasedMeta')}</p>
            </div>
            <p className="q-flow__state">
              <span className="q-flow__label">{t('howItWorks.flow.stateLabel')}</span>
              <span className="q-flow__value">{t('howItWorks.flow.stateValue')}</span>
            </p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="q-section">
        <div className="q-container q-stack q-gap-32">
          {steps.map((step, index) => (
            <div className={`q-stepblock${STEP_FLIP[index] ? ' q-stepblock--flip' : ''} q-reveal`} key={step.num}>
              <div className="q-stepblock__copy">
                <span className="q-step-num">{step.num}</span>
                <h2 className="q-h3 q-mt-16">{step.title}</h2>
                <p className="q-body q-mt-16">{step.text}</p>
                <p className="q-stepblock__note">
                  <strong>{step.label}</strong>
                  {' '}
                  {step.note}
                </p>
              </div>

              <div className="q-stepblock__visual">
                <div className="q-mini" aria-hidden="true">
                  <p className="q-mini__cap">{step.cap}</p>
                  <StepMockupBody mockup={STEP_MOCKUPS[index]} t={t} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Disputes */}
      <section className="q-section q-section--lg q-section--navy q-on-dark q-reveal">
        <div className="q-container">
          <div className="q-sechead">
            <div className="q-sechead__text">
              <p className="q-eyebrow q-eyebrow--light">{t('howItWorks.disputes.eyebrow')}</p>
              <h2 className="q-h2 q-sechead__title">{t('howItWorks.disputes.title')}</h2>
              <p className="q-body q-sechead__sub">{t('howItWorks.disputes.text')}</p>
            </div>
          </div>

          <div className="q-steps">
            {disputeSteps.map((item) => (
              <div className="q-panel q-step" key={item.step}>
                <p className="q-eyebrow q-eyebrow--light">{item.step}</p>
                <h3 className="q-h5" style={{ color: '#fff' }}>{item.title}</h3>
                <p className="q-featrow__text">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For buyers / sellers + FAQ */}
      <section className="q-section q-section--lg q-reveal">
        <div className="q-container">
          <div className="q-grid q-grid--2 q-mb-40">
            <div className="q-card q-card--pad-lg">
              <h2 className="q-h4">{t('howItWorks.buyersTitle')}</h2>
              <ul className="q-checklist q-mt-20">
                {t.list('howItWorks.buyers').map((point) => (
                  <li key={point}><CheckMark size={16} /><span>{point}</span></li>
                ))}
              </ul>
            </div>
            <div className="q-card q-card--pad-lg">
              <h2 className="q-h4">{t('howItWorks.sellersTitle')}</h2>
              <ul className="q-checklist q-mt-20">
                {t.list('howItWorks.sellers').map((point) => (
                  <li key={point}><CheckMark size={16} /><span>{point}</span></li>
                ))}
              </ul>
            </div>
          </div>

          <div className="q-faq">
            {faqs.map((faq, index) => (
              <div className="q-faq__item" key={faq.q}>
                <h3>
                  <button className="q-faq__q" type="button" aria-expanded="false" aria-controls={`q-hiw-faq-${index}`}>
                    <span>{faq.q}</span>
                    <span className="q-faq__icon" aria-hidden="true">+</span>
                  </button>
                </h3>
                <div className="q-faq__a" id={`q-hiw-faq-${index}`} role="region">
                  <div><p>{faq.a}</p></div>
                </div>
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
