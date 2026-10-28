import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SITE } from '@/app/(marketing)/_bizik/site';
import { Breadcrumbs, Prose } from '@/app/(marketing)/_bizik/shared';
import { fetchHelpArticle, fetchHelpArticles, HELP_TOPICS } from '@/app/(marketing)/_bizik/data';
import { alternatesFor, getTranslator, localeHref, toLang, type Lang } from '@/app/(marketing)/_bizik/i18n';

export const revalidate = 300;

function readingTime(body: string, lang: Lang): string {
  const words = body.split(/\s+/).filter(Boolean).length;
  return getTranslator(lang)('help.minRead', { count: Math.max(1, Math.round(words / 200)) });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang: rawLang, slug } = await params;
  const lang = toLang(rawLang);
  const t = getTranslator(lang);
  const article = await fetchHelpArticle(slug);
  if (!article) return { title: t('help.articleNotFound') };
  const firstLine =
    article.body.split('\n').find((line) => line.trim() && !line.trim().startsWith('#')) ?? '';
  const description = firstLine.replace(/[*_`>#[\]()]/g, '').trim().slice(0, 155);
  return {
    title: t('help.articleMetaTitle', { title: article.title }),
    description,
    alternates: alternatesFor(lang, `/help-centre/${article.slug}`),
    openGraph: { title: article.title, description, url: localeHref(lang, `/help-centre/${article.slug}`), type: 'article' },
  };
}

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang: rawLang, slug } = await params;
  const lang = toLang(rawLang);
  const t = getTranslator(lang);
  const article = await fetchHelpArticle(slug);
  if (!article) notFound();

  const topic = HELP_TOPICS.find((t) => t.slug === article.category);
  const all = await fetchHelpArticles().catch(() => []);
  const related = all
    .filter((candidate) => candidate.category === article.category && candidate.slug !== article.slug)
    .slice(0, 8);

  return (
    <article>
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner">
          <Breadcrumbs lang={lang} trail={[{ label: t('help.crumb'), href: '/help-centre' }, { label: article.title }]} />
          {topic && (
            <Link className="q-tag q-badge--blue" href={localeHref(lang, `/help-centre#topic-${topic.slug}`)}>
              {t(`help.topics.${topic.slug}`)}
            </Link>
          )}
          <h1 className="q-h1 q-pagehero__title">{article.title}</h1>
          <div className="q-article__meta" style={{ color: 'var(--q-blue-300)' }}>
            <span>{readingTime(article.body, lang)}</span>
          </div>
        </div>
      </section>

      <section className="q-section">
        <div className="q-container q-article">
          <div>
            <Prose markdown={article.body} tocSource />
            <div
              className="q-row q-gap-16 q-row--wrap q-mt-32"
              style={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Link className="q-btn q-btn--outline q-btn--sm" href={localeHref(lang, '/help-centre')}>
                {t('help.allArticles')}
              </Link>
              <p className="q-tiny">{t('help.helpful')}</p>
            </div>
          </div>

          <aside className="q-article__aside">
            {related.length > 0 && topic && (
              <div>
                <p className="q-eyebrow q-mb-12">{t('help.moreIn', { topic: t(`help.topics.${topic.slug}`) })}</p>
                <nav className="q-toc" aria-label={t('help.relatedAria')}>
                  {related.map((item) => (
                    <Link key={item.slug} href={localeHref(lang, `/help-centre/${item.slug}`)}>
                      {item.title}
                    </Link>
                  ))}
                </nav>
              </div>
            )}
            <div className="q-card q-card--blue">
              <h2 className="q-h6" style={{ color: '#fff' }}>{t('help.stillTitle')}</h2>
              <p className="q-card__text q-mt-8">{t('help.asideText')}</p>
              <Link className="q-btn q-btn--solid-white q-btn--sm q-btn--block q-mt-16" href={localeHref(lang, '/contact')}>
                {t('help.contactCta')}
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <section className="q-section q-section--tight q-reveal">
        <div className="q-container">
          <div className="q-cta">
            <div>
              <p className="q-cta__title">{t('home.closing.title')}</p>
              <p className="q-cta__text">{t('home.closing.text')}</p>
            </div>
            <div className="q-cta__actions">
              <Link className="q-btn q-btn--solid-white" href={SITE.signupUrl}>{t('home.closing.ctaPrimary')}</Link>
              <Link className="q-btn q-btn--ghost-light" href={localeHref(lang, '/contact')}>{t('home.closing.ctaSecondary')}</Link>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}
