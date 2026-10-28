import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/app/(marketing)/_bizik/Icon';
import { Breadcrumbs } from '@/app/(marketing)/_bizik/shared';
import { HelpFilter } from '@/app/(marketing)/_bizik/HelpFilter';
import { fetchHelpArticles, HELP_TOPICS } from '@/app/(marketing)/_bizik/data';
import { alternatesFor, getTranslator, localeHref, toLang } from '@/app/(marketing)/_bizik/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  return {
    title: t('help.metaTitle'),
    description: t('help.metaDescription'),
    alternates: alternatesFor(lang, '/help-centre'),
    openGraph: {
      title: t('help.ogTitle'),
      description: t('help.title'),
      url: localeHref(lang, '/help-centre'),
      type: 'website',
    },
  };
}

function excerptOf(markdown: string): string {
  const firstPara = markdown.split('\n').find((line) => line.trim() && !line.trim().startsWith('#'));
  const text = (firstPara ?? '').replace(/[*_`>#[\]()]/g, '').trim();
  return text.length > 150 ? `${text.slice(0, 147)}…` : text;
}

export default async function HelpCentrePage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  const articles = await fetchHelpArticles().catch(() => []);
  const total = articles.length;

  /** Topic names are translated; the slugs stay as the API and the CSS know them. */
  const topicName = (slug: string) => t(`help.topics.${slug}`);

  // Order topics by the canonical list, keep only those with articles.
  const topics = HELP_TOPICS.map((topic) => ({
    ...topic,
    count: articles.filter((article) => article.category === topic.slug).length,
  })).filter((topic) => topic.count > 0);

  return (
    <>
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner">
          <Breadcrumbs lang={lang} trail={[{ label: t('help.crumb') }]} />
          <h1 className="q-h1 q-pagehero__title">{t('help.title')}</h1>
          <p className="q-pagehero__text">
            {total === 1 ? t('help.searchOne', { count: total }) : t('help.searchMany', { count: total })}
          </p>

          <div className="q-help-search q-mt-24">
            <Icon name="search" size={19} />
            <label className="sr-only" htmlFor="q-help-q">{t('help.searchLabel')}</label>
            <input type="search" id="q-help-q" data-help-query placeholder={t('help.searchPlaceholder')} />
          </div>

          <p className="q-tiny q-mt-16">
            {t('help.popular')}
            {t.list('help.popularTerms').map((term) => (
              <button
                key={term}
                type="button"
                className="q-tag q-badge--new"
                style={{ marginLeft: 6, cursor: 'pointer' }}
                data-help-chip={term}
              >
                {term}
              </button>
            ))}
          </p>
        </div>
      </section>

      <section className="q-section q-section--lg" data-help-scope>
        <div className="q-container">
          <div className="q-sechead q-mb-24">
            <h2 className="q-h3">{t('help.browseTitle')}</h2>
          </div>

          <div className="q-cat-filter q-mb-32" role="tablist" aria-label={t('help.filterAria')}>
            <a href="#topic-all" className="is-active" role="tab" aria-selected="true" data-help-topic="all">
              {t('help.all')}
            </a>
            {topics.map((topic) => (
              <a
                key={topic.slug}
                href={`#topic-${topic.slug}`}
                role="tab"
                aria-selected="false"
                data-help-topic={topic.slug}
              >
                {topicName(topic.slug)}
                <span className="q-help-tab__count" aria-hidden="true">{topic.count}</span>
              </a>
            ))}
          </div>

          <div className="q-postgrid q-help-grid" data-help-grid>
            {articles.map((article) => {
              const topic = HELP_TOPICS.find((candidate) => candidate.slug === article.category);
              const searchText = `${article.title} ${article.body}`.toLowerCase();
              return (
                <Link
                  key={article.slug}
                  className="q-post"
                  href={localeHref(lang, `/help-centre/${article.slug}`)}
                  data-help-item
                  data-help-topic={article.category}
                  data-help-text={searchText}
                >
                  <div className="q-post__body">
                    {topic && (
                      <span className="q-tag q-badge--blue" style={{ alignSelf: 'flex-start' }}>
                        {topicName(topic.slug)}
                      </span>
                    )}
                    <h3 className="q-post__title">{article.title}</h3>
                    <p className="q-post__excerpt">{excerptOf(article.body)}</p>
                    <p className="q-post__meta">{t('help.readArticle')}</p>
                  </div>
                </Link>
              );
            })}
          </div>

          <p className="q-body q-mt-24" data-help-empty hidden>
            {t('help.noMatch')}
          </p>
        </div>
      </section>

      <section className="q-section q-section--tint q-reveal">
        <div className="q-container">
          <div className="q-card q-card--pad-lg q-row q-gap-24 q-row--wrap" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2 className="q-h4">{t('help.stillTitle')}</h2>
              <p className="q-body q-mt-8">{t('help.stillText')}</p>
            </div>
            <Link className="q-btn q-btn--primary" href={localeHref(lang, '/contact')}>{t('help.contactCta')}</Link>
          </div>
        </div>
      </section>

      <HelpFilter />
    </>
  );
}
