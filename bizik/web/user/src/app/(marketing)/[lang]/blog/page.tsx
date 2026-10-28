import type { Metadata } from 'next';
import Link from 'next/link';

import { Breadcrumbs, PostCard } from '@/app/(marketing)/_bizik/shared';
import { fetchBlogCategories, fetchBlogPosts } from '@/app/(marketing)/_bizik/data';
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
    title: t('content.blogMetaTitle'),
    description: t('content.blogMetaDescription'),
    alternates: alternatesFor(lang, '/blog'),
    openGraph: {
      title: t('content.blogOgTitle'),
      description: t('content.blogOgDescription'),
      url: localeHref(lang, '/blog'),
      type: 'website',
    },
  };
}

export default async function BlogIndexPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = toLang((await params).lang);
  const t = getTranslator(lang);
  const [posts, categories] = await Promise.all([
    fetchBlogPosts({ lang }).catch(() => []),
    fetchBlogCategories(lang).catch(() => []),
  ]);
  const [featured, ...rest] = posts;

  return (
    <>
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner">
          <Breadcrumbs lang={lang} trail={[{ label: t('content.blogCrumb') }]} />
          <h1 className="q-h1 q-pagehero__title">{t('content.blogTitle')}</h1>
          <p className="q-pagehero__text">{t('content.blogText')}</p>
        </div>
      </section>

      <section className="q-section q-section--lg">
        <div className="q-container">
          {categories.length > 0 && (
            <div className="q-cat-filter q-mb-32">
              <Link href={localeHref(lang, '/blog')} className="is-active">{t('content.all')}</Link>
              {categories.map((category) => (
                <Link key={category.slug} href={localeHref(lang, `/category/${category.slug}`)}>
                  {category.label}
                </Link>
              ))}
            </div>
          )}

          {posts.length === 0 ? (
            <div className="q-card q-card--pad-lg q-center">
              <h2 className="q-h4">{t('content.emptyTitle')}</h2>
              <p className="q-body q-mt-8">{t('content.emptyText')}</p>
            </div>
          ) : (
            <div className="q-postgrid q-postgrid--feature">
              {featured && <PostCard post={featured} lang={lang} large />}
              {rest.map((post) => (
                <PostCard key={post.slug} post={post} lang={lang} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
