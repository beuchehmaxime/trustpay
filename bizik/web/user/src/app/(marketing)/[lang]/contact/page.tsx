import type { Metadata } from 'next';

import { Icon } from '@/app/(marketing)/_bizik/Icon';
import { Breadcrumbs } from '@/app/(marketing)/_bizik/shared';
import { ContactForm, type ContactFormCopy } from '@/app/(marketing)/_bizik/ContactForm';
import { alternatesFor, getTranslator, localeHref, toLang } from '@/app/(marketing)/_bizik/i18n';
import { SUPPORT_EMAILS } from '@/app/(marketing)/_bizik/site';

/** Google Maps embed of the Bizik office: 1117 Rue 5.056, Douala. */
const OFFICE_MAP_EMBED_URL =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d563.8493422414042!2d9.738956457952833!3d4.08993200876847!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x10610de23c9c18b5%3A0x3615c1048f7bbc36!2s1117%20Rue%205.056%2C%20Douala!5e1!3m2!1sen!2scm!4v1789642795335!5m2!1sen!2scm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return {
    title: t('contact.meta.title'),
    description: t('contact.meta.description'),
    alternates: alternatesFor(lang, '/contact'),
    openGraph: {
      title: t('contact.meta.title'),
      description: t('contact.meta.description'),
      url: localeHref(lang, '/contact'),
      type: 'website',
    },
  };
}

export default async function ContactPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  const formCopy: ContactFormCopy = {
    honeypot: t('contact.form.honeypot'),
    name: t('contact.form.name'),
    phone: t('contact.form.phone'),
    email: t('contact.form.email'),
    topic: t('contact.form.topic'),
    message: t('contact.form.message'),
    consent: t('contact.form.consent'),
    submit: t('contact.form.submit'),
    sending: t('contact.form.sending'),
    pinWarning: t('contact.form.pinWarning'),
    error: t('contact.form.error', { email: SUPPORT_EMAILS.support }),
    sentTitle: t('contact.form.sentTitle'),
    sentText: t('contact.form.sentText'),
    sentAgain: t('contact.form.sentAgain'),
    topics: t.list('contact.form.topics'),
  };

  return (
    <>
      {/* Page hero */}
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner">
          <Breadcrumbs lang={lang} trail={[{ label: t('contact.crumb') }]} />
          <p className="q-eyebrow q-eyebrow--light">{t('contact.eyebrow')}</p>
          <h1 className="q-h1 q-pagehero__title">{t('contact.title')}</h1>
          <p className="q-pagehero__text">{t('contact.text')}</p>
        </div>
      </section>

      <section className="q-section q-section--lg q-reveal">
        <div className="q-container q-contact">
          <div className="q-contact-methods">
            <div className="q-card">
              <div className="q-contact-method">
                <span className="q-icon-tile">
                  <svg
                    className="q-icon"
                    width={19}
                    height={19}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M20 15a3 3 0 01-3 3H8l-4 3V7a3 3 0 013-3h10a3 3 0 013 3z" />
                  </svg>
                </span>
                <div>
                  <p className="q-row q-gap-10 q-row--wrap">
                    <span className="q-card__title">{t('contact.supportTitle')}</span>
                    <span className="q-tag q-badge--grey">{t('contact.supportSla')}</span>
                  </p>
                  <p className="q-card__text q-mt-8">{t('contact.supportText')}</p>
                  <p className="q-tiny q-mt-8">{SUPPORT_EMAILS.support} · WhatsApp +237 6 00 00 00 00</p>
                </div>
              </div>
            </div>

            <div className="q-card">
              <div className="q-contact-method">
                <span className="q-icon-tile">
                  <Icon name="briefcase" size={19} />
                </span>
                <div>
                  <p className="q-row q-gap-10 q-row--wrap">
                    <span className="q-card__title">{t('contact.businessTitle')}</span>
                    <span className="q-tag q-badge--grey">{t('contact.businessSla')}</span>
                  </p>
                  <p className="q-card__text q-mt-8">{t('contact.businessText')}</p>
                  <p className="q-tiny q-mt-8">{SUPPORT_EMAILS.business}</p>
                </div>
              </div>
            </div>

            <div className="q-card">
              <div className="q-contact-method">
                <span className="q-icon-tile">
                  <svg
                    className="q-icon"
                    width={19}
                    height={19}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <path d="M3.5 7l8.5 6 8.5-6" />
                  </svg>
                </span>
                <div>
                  <p className="q-row q-gap-10 q-row--wrap">
                    <span className="q-card__title">{t('contact.pressTitle')}</span>
                    <span className="q-tag q-badge--grey">{t('contact.pressSla')}</span>
                  </p>
                  <p className="q-card__text q-mt-8">{t('contact.pressText')}</p>
                  <p className="q-tiny q-mt-8">{SUPPORT_EMAILS.press}</p>
                </div>
              </div>
            </div>

            <div className="q-card">
              <div className="q-contact-method">
                <span className="q-icon-tile">
                  <svg
                    className="q-icon"
                    width={19}
                    height={19}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                </span>
                <div>
                  <p className="q-card__title">{t('contact.officeTitle')}</p>
                  <p className="q-card__text q-mt-8">
                    {t('contact.officeCity')}<br />
                    {t('contact.officeHours')}
                  </p>
                </div>
              </div>
              <div className="q-map q-mt-16">
                <iframe
                  className="q-map__frame"
                  src={OFFICE_MAP_EMBED_URL}
                  title={t('contact.mapTitle')}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>
          </div>

          <div className="q-card q-card--pad-lg">
            <h2 className="q-h4 q-mb-24">{t('contact.formTitle')}</h2>

            <ContactForm copy={formCopy} />
          </div>
        </div>
      </section>
    </>
  );
}
