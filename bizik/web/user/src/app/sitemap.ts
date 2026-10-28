import type { MetadataRoute } from 'next';

import { SITE } from './(marketing)/_bizik/site';
import { fetchBlogPosts, fetchHelpArticles } from './(marketing)/_bizik/data';
import { MARKETING_LANGS, HTML_LANG, localeHref } from './(marketing)/_bizik/i18n';

// Regenerate on request (with the backend up) so every published blog post and
// help article is listed - a build-time sitemap runs while the API is down.
export const dynamic = 'force-dynamic';

/**
 * XML sitemap for search engines: the static marketing pages plus every
 * published blog post and help article (pulled live from the backend so new
 * content is indexed without a redeploy). Legal pages are included too.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url;
  const now = new Date();

  /**
   * Every page is listed once per language, each entry carrying the full set of
   * `alternates` so a crawler can see the two versions are the same page rather
   * than duplicates competing with each other.
   */
  /**
   * The home page is listed as '' so its URL is the bare origin, but a language
   * prefix has to attach to a real path - otherwise English and French both
   * come out as the origin and the French home page never gets listed. Normalise
   * to '/' for prefixing, then drop it again so the URL keeps its usual shape.
   */
  const urlFor = (lang: (typeof MARKETING_LANGS)[number], path: string) => {
    const prefixed = localeHref(lang, path === '' ? '/' : path);
    return `${base}${prefixed === '/' ? '' : prefixed}`;
  };
  const alternatesFor = (path: string) =>
    Object.fromEntries(MARKETING_LANGS.map((lang) => [HTML_LANG[lang], urlFor(lang, path)]));
  const perLanguage = <T,>(paths: string[], build: (path: string, url: string) => T): T[] =>
    paths.flatMap((path) => MARKETING_LANGS.map((lang) => build(path, urlFor(lang, path))));

  const staticPaths = [
    '',
    '/how-it-works',
    '/pricing',
    '/send-money',
    '/receive-money',
    '/security',
    '/for-freelancers',
    '/for-business',
    '/about',
    '/contact',
    '/blog',
    '/help-centre',
    '/terms-of-service',
    '/privacy-policy',
    '/cookie-policy',
    '/aml-kyc-policy',
    '/dispute-policy',
  ];

  const staticEntries: MetadataRoute.Sitemap = perLanguage(staticPaths, (path, url) => ({
    url,
    lastModified: now,
    alternates: { languages: alternatesFor(path) },
    changeFrequency: path === '' || path === '/blog' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));

  const [postsByLang, articles] = await Promise.all([
    Promise.all(MARKETING_LANGS.map((lang) => fetchBlogPosts({ lang }).catch(() => []))),
    fetchHelpArticles().catch(() => []),
  ]);

  /**
   * Blog posts are written per language, each with its own slug, so a post is
   * listed once, under its own language, and its alternates are the other
   * language versions of the same article (grouped by translationKey).
   */
  const posts = postsByLang.flat();
  const versionsByKey = new Map<string, typeof posts>();
  for (const post of posts) {
    versionsByKey.set(post.translationKey, [...(versionsByKey.get(post.translationKey) ?? []), post]);
  }
  const postEntries: MetadataRoute.Sitemap = posts.map((post) => {
    const versions = versionsByKey.get(post.translationKey) ?? [post];
    const languages = Object.fromEntries(
      versions.map((version) => {
        const versionLang = version.lang === 'fr' ? 'fr' : 'en';
        return [HTML_LANG[versionLang], urlFor(versionLang, `/blog/${version.slug}`)];
      }),
    );
    return {
      url: urlFor(post.lang === 'fr' ? 'fr' : 'en', `/blog/${post.slug}`),
      lastModified: post.publishedAt ? new Date(post.publishedAt) : now,
      alternates: { languages },
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    };
  });

  const articleEntries: MetadataRoute.Sitemap = articles.flatMap((article) =>
    MARKETING_LANGS.map((lang) => ({
      url: urlFor(lang, `/help-centre/${article.slug}`),
      lastModified: article.updatedAt ? new Date(article.updatedAt) : now,
      alternates: { languages: alternatesFor(`/help-centre/${article.slug}`) },
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  );

  return [...staticEntries, ...postEntries, ...articleEntries];
}
