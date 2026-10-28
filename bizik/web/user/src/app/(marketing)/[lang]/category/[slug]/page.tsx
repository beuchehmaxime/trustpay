import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Breadcrumbs, PostCard } from '@/app/(marketing)/_bizik/shared';
import { fetchBlogCategories, fetchBlogPosts } from '@/app/(marketing)/_bizik/data';
import { alternatesFor, getTranslator, localeHref, toLang } from '@/app/(marketing)/_bizik/i18n';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang: rawLang, slug } = await params;
  const lang = toLang(rawLang);
  const t = getTranslator(lang);
  const categories = await fetchBlogCategories(lang).catch(() => []);
  const category = categories.find((c) => c.slug === slug);
  const label = category?.label ?? slug;
  return {
    title: t('content.categoryMetaTitle', { label }),
    description: t('content.categoryMetaDescription', { label: label.toLowerCase() }),
    alternates: alternatesFor(lang, `/category/${slug}`),
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang: rawLang, slug } = await params;
  const lang = toLang(rawLang);
  const t = getTranslator(lang);
  const [posts, categories] = await Promise.all([
    fetchBlogPosts({ category: slug, lang }).catch(() => []),
    fetchBlogCategories(lang).catch(() => []),
  ]);
  const category = categories.find((c) => c.slug === slug);
  if (!category && posts.length === 0) notFound();
  const label = category?.label ?? slug;

  return (
    <>
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner">
          <Breadcrumbs lang={lang} trail={[{ label: t('content.blogCrumb'), href: '/blog' }, { label }]} />
          <h1 className="q-h1 q-pagehero__title">{label}</h1>
        </div>
      </section>

      <section className="q-section">
        <div className="q-container">
          <div className="q-cat-filter q-mb-32">
            <Link href={localeHref(lang, '/blog')}>{t('content.all')}</Link>
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={localeHref(lang, `/category/${cat.slug}`)}
                className={cat.slug === slug ? 'is-active' : ''}
              >
                {cat.label}
              </Link>
            ))}
          </div>

          {posts.length === 0 ? (
            <div className="q-card q-card--pad-lg q-center">
              <h2 className="q-h4">{t('content.emptyTitle')}</h2>
            </div>
          ) : (
            <div className="q-postgrid">
              {posts.map((post) => (
                <PostCard key={post.slug} post={post} lang={lang} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
