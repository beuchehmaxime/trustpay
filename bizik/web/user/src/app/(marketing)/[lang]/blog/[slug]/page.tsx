import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';

import { Icon } from '@/app/(marketing)/_bizik/Icon';
import { ArticleJsonLd } from '@/app/(marketing)/_bizik/JsonLd';
import { SITE } from '@/app/(marketing)/_bizik/site';
import { Breadcrumbs, Prose, PostCard, formatDate } from '@/app/(marketing)/_bizik/shared';
import { fetchBlogPost, fetchBlogPosts } from '@/app/(marketing)/_bizik/data';
import { HTML_LANG, getTranslator, localeHref, toLang } from '@/app/(marketing)/_bizik/i18n';
import type { BlogPostDetail } from '@/app/(marketing)/_bizik/data';

/**
 * hreflang for one article. Unlike the static pages, the language versions of
 * a post have different slugs, so the alternates come from the post itself
 * (only the languages it was actually written in) rather than from swapping
 * the locale prefix on one path.
 */
function articleAlternates(post: BlogPostDetail) {
  const postLang = toLang(post.lang);
  const languages: Record<string, string> = {};
  for (const [altLang, altSlug] of Object.entries(post.alternates ?? {})) {
    const typedLang = toLang(altLang);
    languages[HTML_LANG[typedLang]] = localeHref(typedLang, `/blog/${altSlug}`);
  }
  const englishSlug = post.alternates?.en;
  languages['x-default'] = englishSlug ? `/blog/${englishSlug}` : localeHref(postLang, `/blog/${post.slug}`);
  return { canonical: localeHref(postLang, `/blog/${post.slug}`), languages };
}

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang: rawLang, slug } = await params;
  const lang = toLang(rawLang);
  const post = await fetchBlogPost(slug);
  if (!post) return { title: getTranslator(lang)('article.notFound') };
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt;
  const postLang = toLang(post.lang);
  return {
    title,
    description,
    alternates: articleAlternates(post),
    openGraph: {
      title,
      description,
      url: localeHref(postLang, `/blog/${post.slug}`),
      type: 'article',
      locale: HTML_LANG[postLang],
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang: rawLang, slug } = await params;
  const lang = toLang(rawLang);
  const t = getTranslator(lang);
  const post = await fetchBlogPost(slug);
  if (!post) notFound();

  // A post lives under its own language only. Asking for it in the other one
  // (the language switcher, an old link) goes to the translation when there is
  // one, otherwise to the post's own URL - never a French page of English text.
  const postLang = toLang(post.lang);
  if (postLang !== lang) {
    const translatedSlug = post.alternates?.[lang];
    permanentRedirect(
      translatedSlug ? localeHref(lang, `/blog/${translatedSlug}`) : localeHref(postLang, `/blog/${post.slug}`),
    );
  }
  const postUrl = `${SITE.url}${localeHref(lang, `/blog/${post.slug}`)}`;

  const related = (await fetchBlogPosts({ category: post.category, limit: 4, lang }).catch(() => []))
    .filter((candidate) => candidate.slug !== post.slug)
    .slice(0, 3);

  return (
    <article>
      <ArticleJsonLd
        lang={lang}
        title={post.title}
        description={post.seoDescription || post.excerpt}
        slug={post.slug}
        publishedAt={post.publishedAt}
        modifiedAt={post.updatedAt}
        author={post.author}
      />
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner">
          <Breadcrumbs lang={lang} trail={[{ label: t('content.blogCrumb'), href: '/blog' }, { label: post.title }]} />
          <span className="q-tag q-badge--blue">{post.categoryLabel}</span>
          <h1 className="q-h1 q-pagehero__title">{post.title}</h1>
          <div className="q-article__meta" style={{ color: 'var(--q-blue-300)' }}>
            {post.author && (
              <>
                <span>{post.author}</span>
                <span>·</span>
              </>
            )}
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, lang)}</time>
            <span>·</span>
            <span>{post.readMinutes} {t('shared.minRead')}</span>
          </div>
        </div>
      </section>

      <section className="q-section">
        <div className="q-container q-article">
          <div>
            <Prose markdown={post.body} tocSource />

            <div
              className="q-row q-gap-16 q-row--wrap q-mt-32"
              style={{ justifyContent: 'space-between' }}
            >
              <p className="q-tiny">{t('article.share')}</p>
              <div className="q-share">
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(postUrl)}&text=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener"
                  aria-label={t('article.shareX')}
                >
                  <Icon name="twitter" size={17} />
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(postUrl)}`}
                  target="_blank"
                  rel="noopener"
                  aria-label={t('article.shareLinkedIn')}
                >
                  <Icon name="linkedin" size={17} />
                </a>
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${post.title} ${postUrl}`)}`}
                  target="_blank"
                  rel="noopener"
                  aria-label={t('article.shareWhatsApp')}
                >
                  <Icon name="whatsapp" size={17} />
                </a>
              </div>
            </div>
          </div>

          <aside className="q-article__aside">
            <div data-toc-wrap>
              <p className="q-eyebrow q-mb-12">{t('article.onThisPage')}</p>
              <nav className="q-toc" data-toc aria-label={t('article.articleContents')} />
            </div>
            <div className="q-card q-card--blue">
              <h2 className="q-h6" style={{ color: '#fff' }}>{t('article.asideTitle')}</h2>
              <p className="q-card__text q-mt-8">{t('article.asideText')}</p>
              <Link className="q-btn q-btn--solid-white q-btn--sm q-btn--block q-mt-16" href={SITE.signupUrl}>
                {t('article.asideCta')}
              </Link>
            </div>
          </aside>
        </div>
      </section>

      {related.length > 0 && (
        <section className="q-section q-section--tint q-reveal">
          <div className="q-container">
            <h2 className="q-h3 q-mb-32">{t('article.related')}</h2>
            <div className="q-postgrid">
              {related.map((item) => (
                <PostCard key={item.slug} post={item} lang={lang} />
              ))}
            </div>
          </div>
        </section>
      )}

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
