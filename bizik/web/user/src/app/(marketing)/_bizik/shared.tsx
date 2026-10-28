import Link from 'next/link';

import { DEFAULT_LANG, getTranslator, localeHref, type Lang } from './i18n';

import { renderMarkdown } from './markdown';
import type { BlogPostSummary } from './data';

/** Breadcrumb trail (matches the design's `q-crumbs`). */
export function Breadcrumbs({
  trail,
  lang = DEFAULT_LANG,
}: {
  trail: { label: string; href?: string }[];
  lang?: Lang;
}) {
  const t = getTranslator(lang);
  return (
    <nav className="q-crumbs" aria-label="Breadcrumb">
      <Link href={localeHref(lang, '/')}>{t('nav.home')}</Link>
      <span>/</span>
      {trail.map((crumb, index) => (
        <span key={crumb.label} style={{ display: 'contents' }}>
          {crumb.href ? (
            <Link href={localeHref(lang, crumb.href)}>{crumb.label}</Link>
          ) : (
            <span>{crumb.label}</span>
          )}
          {index < trail.length - 1 ? <span>/</span> : null}
        </span>
      ))}
    </nav>
  );
}

/** Markdown body rendered into the design's `.q-prose` container (+ TOC source). */
export function Prose({ markdown, tocSource = false }: { markdown: string; tocSource?: boolean }) {
  return (
    <div
      className="q-prose"
      {...(tocSource ? { 'data-toc-source': '' } : {})}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
    />
  );
}

export function formatDate(iso?: string | null, lang: Lang = DEFAULT_LANG): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  // Both languages put the day first; only the month name changes, so the
  // Intl month name keeps this correct without a second month table.
  const month = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    month: 'long',
  }).format(date);
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

/** Blog post card used across the blog grid, category pages and related lists. */
export function PostCard({
  post,
  large = false,
  lang = DEFAULT_LANG,
}: {
  post: BlogPostSummary;
  large?: boolean;
  lang?: Lang;
}) {
  return (
    <Link
      className={`q-post${large ? ' q-post--lg' : ''}`}
      href={localeHref(lang, `/blog/${post.slug}`)}
    >
      <div className="q-photo">
        {post.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverImage} alt="" loading="lazy" />
        ) : (
          <span>{post.categoryLabel}</span>
        )}
      </div>
      <div className="q-post__body">
        <span className="q-tag q-badge--blue" style={{ alignSelf: 'flex-start' }}>
          {post.categoryLabel}
        </span>
        <h2 className="q-post__title">{post.title}</h2>
        <p className="q-post__excerpt">{post.excerpt}</p>
        <p className="q-post__meta">
          {post.categoryLabel} · {post.readMinutes} min read
        </p>
      </div>
    </Link>
  );
}
