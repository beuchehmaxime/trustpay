import { SITE, SUPPORT_EMAILS } from './site';
import { getTranslator, localeHref, type Lang } from './i18n';

/**
 * Structured data for the public site.
 *
 * Search engines read this to build the knowledge panel, the sitelinks search
 * box and the FAQ rich result. It is rendered as a script tag rather than
 * through metadata because Next's metadata API has no JSON-LD field.
 *
 * Only facts that are true and checkable go in here. Schema is the first thing
 * a search engine cross-references against the page, and a claim that does not
 * match the visible text is worse than no markup at all.
 */

function Script({ data }: { data: object }) {
  // Some of this data is authored content (post titles, help answers), and
  // JSON.stringify does not escape `<`: a title containing `</script>` would
  // close this tag and run whatever follows. Escaping the three characters an
  // HTML parser reacts to keeps the JSON valid and inert.
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

/** Who Bizik is, and the site itself. Rendered once, in the layout. */
export function OrganisationJsonLd({ lang }: { lang: Lang }) {
  const t = getTranslator(lang);
  const organisation = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: SITE.name,
    legalName: 'Lyftsoft Technologies',
    url: SITE.url,
    logo: `${SITE.url}/brand/logo-icon.png`,
    description: t('root.description'),
    email: SUPPORT_EMAILS.support,
    areaServed: { '@type': 'Country', name: 'Cameroon' },
    // Only real profiles: the defaults are bare domains with no handle, and
    // claiming a profile that does not exist is a markup error.
    sameAs: (Object.values(SITE.social) as string[]).filter((href) => {
      if (!href || href === '#') return false;
      try {
        return new URL(href).pathname.replace(/\/+$/, '') !== '';
      } catch {
        return false;
      }
    }),
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    url: SITE.url,
    name: SITE.name,
    inLanguage: lang,
    publisher: { '@id': `${SITE.url}/#organization` },
  };

  return (
    <>
      <Script data={organisation} />
      <Script data={website} />
    </>
  );
}

/** The homepage FAQ, so the questions can win a rich result. */
export function FaqJsonLd({ items }: { items: { q: string; a: string }[] }) {
  if (!items.length) return null;
  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      }}
    />
  );
}

/** The trail shown in the search result under the title. */
export function BreadcrumbJsonLd({
  lang,
  trail,
}: {
  lang: Lang;
  trail: { label: string; href?: string }[];
}) {
  const t = getTranslator(lang);
  const entries = [{ label: t('nav.home'), href: '/' }, ...trail];
  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: entries.map((entry, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: entry.label,
          ...(entry.href ? { item: `${SITE.url}${localeHref(lang, entry.href)}` } : {}),
        })),
      }}
    />
  );
}

/** A blog post. */
export function ArticleJsonLd({
  lang,
  title,
  description,
  slug,
  publishedAt,
  modifiedAt,
  image,
  author,
}: {
  lang: Lang;
  title: string;
  description: string;
  slug: string;
  publishedAt?: string | null;
  modifiedAt?: string | null;
  image?: string | null;
  author?: string | null;
}) {
  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title,
        description,
        inLanguage: lang,
        mainEntityOfPage: `${SITE.url}${localeHref(lang, `/blog/${slug}`)}`,
        ...(publishedAt ? { datePublished: publishedAt } : {}),
        ...(modifiedAt ? { dateModified: modifiedAt } : {}),
        ...(image ? { image } : {}),
        author: author
          ? { '@type': 'Person', name: author }
          : { '@id': `${SITE.url}/#organization` },
        publisher: { '@id': `${SITE.url}/#organization` },
      }}
    />
  );
}
