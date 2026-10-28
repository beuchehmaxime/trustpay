/** Blog authoring types - mirrors backend BlogAdminService (SRS MOD-13). */

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  categoryLabel: string;
  coverImage: string | null;
  author: string | null;
  readMinutes: number;
  seoTitle: string | null;
  seoDescription: string | null;
  /** "en" | "fr" - each language version is its own post. */
  lang: string;
  /** Links language versions of one article: the English post's slug. */
  translationKey: string | null;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload for create (POST) and update (PUT). The backend derives `slug` from
 * the title when omitted and treats every field as optional on update, so the
 * form always sends the full set and lets the backend reconcile.
 */
export interface BlogPostInput {
  title: string;
  slug?: string;
  excerpt: string;
  body: string;
  category: string;
  categoryLabel: string;
  coverImage?: string;
  author?: string;
  readMinutes: number;
  seoTitle?: string;
  seoDescription?: string;
  lang: 'en' | 'fr';
  translationKey?: string | null;
  published: boolean;
}

/** Known content categories (slug → display label); custom values still allowed. */
export const BLOG_CATEGORIES: { slug: string; label: string }[] = [
  { slug: 'guides', label: 'Guides' },
  { slug: 'scam-alerts', label: 'Scam alerts' },
  { slug: 'freelancing', label: 'Freelancing' },
  { slug: 'money', label: 'Money' },
  { slug: 'buying-selling', label: 'Buying & selling' },
];
