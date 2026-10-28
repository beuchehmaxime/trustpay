/**
 * Server-side data access for the public marketing site. Fetches published
 * blog posts, help-centre articles and legal documents from the backend's
 * PUBLIC content API. Runs only in server components / route handlers; results
 * are cached with ISR so new content appears without a redeploy.
 *
 * `API_INTERNAL_URL` lets the server reach the backend directly inside Docker
 * (e.g. http://backend:3000/api/v1); it falls back to the public API URL for
 * local dev.
 */
const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3000/api/v1';

const REVALIDATE = 300; // seconds - refresh published content every 5 minutes

export interface BlogPostSummary {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  categoryLabel: string;
  coverImage: string | null;
  author: string | null;
  readMinutes: number;
  publishedAt: string;
  /** "en" | "fr" - each language version is its own post with its own slug. */
  lang: string;
  /** Shared by the language versions of one article (the English slug). */
  translationKey: string;
}
export interface BlogPostDetail extends BlogPostSummary {
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
  /** Slug of this article in each language it exists in, e.g. { en, fr }. */
  alternates: Record<string, string>;
}
/** Live fee rates, in percent, as configured in the admin console. */
export interface PublicFees {
  buyerPct: number;
  sellerPct: number;
  fxMarginPct: number;
  minWithdrawalUsd: number;
}
export interface BlogCategory {
  slug: string;
  label: string;
  count: number;
}
export interface HelpArticleSummary {
  slug: string;
  title: string;
  category: string;
  body: string;
  order: number;
  updatedAt?: string;
}
export interface HelpArticleDetail {
  slug: string;
  title: string;
  category: string;
  body: string;
  updatedAt: string;
}
export interface LegalDoc {
  type: string;
  title: string;
  content: string;
  version: string;
  effectiveAt: string | null;
  updatedAt: string;
}

/** Help-centre topics, in display order (mirrors the backend seed). */
export const HELP_TOPICS: { slug: string; name: string }[] = [
  { slug: 'getting-started', name: 'Getting started' },
  { slug: 'deals', name: 'Deals and escrow' },
  { slug: 'money', name: 'Money and your wallet' },
  { slug: 'verification', name: 'Verification' },
  { slug: 'fees', name: 'Fees' },
  { slug: 'disputes', name: 'Disputes' },
  { slug: 'security', name: 'Security' },
  { slug: 'whatsapp', name: 'WhatsApp' },
  { slug: 'troubleshooting', name: 'Troubleshooting' },
  { slug: 'contact', name: 'Contact' },
];

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`content fetch ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchBlogPosts(
  opts: { category?: string; limit?: number; lang?: string } = {},
): Promise<BlogPostSummary[]> {
  const params = new URLSearchParams();
  if (opts.lang) params.set('lang', opts.lang);
  if (opts.category) params.set('category', opts.category);
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return getJson<BlogPostSummary[]>(`/blog${qs ? `?${qs}` : ''}`);
}

export async function fetchBlogCategories(lang?: string): Promise<BlogCategory[]> {
  return getJson<BlogCategory[]>(`/blog/categories${lang ? `?lang=${lang}` : ''}`);
}

/** Current fees, or null when the API is unreachable (callers fall back). */
export async function fetchFees(): Promise<PublicFees | null> {
  try {
    return await getJson<PublicFees>('/fees');
  } catch {
    return null;
  }
}

export async function fetchBlogPost(slug: string): Promise<BlogPostDetail | null> {
  try {
    return await getJson<BlogPostDetail>(`/blog/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

export async function fetchHelpArticles(): Promise<HelpArticleSummary[]> {
  return getJson<HelpArticleSummary[]>('/help');
}

export async function fetchHelpArticle(slug: string): Promise<HelpArticleDetail | null> {
  try {
    return await getJson<HelpArticleDetail>(`/help/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

export async function fetchLegal(type: string): Promise<LegalDoc | null> {
  try {
    return await getJson<LegalDoc>(`/legal/${encodeURIComponent(type)}`);
  } catch {
    return null;
  }
}

/**
 * Used only when the API is unreachable at render time, so the page still
 * shows sensible figures. Keep in step with the production fee settings.
 */
const FALLBACK_FEES: PublicFees = {
  buyerPct: 2.5,
  sellerPct: 0,
  fxMarginPct: 1.2,
  minWithdrawalUsd: 5,
};

/** Live fees, falling back to the last known production values. */
export async function loadFees(): Promise<PublicFees> {
  return (await fetchFees()) ?? FALLBACK_FEES;
}

/** A percentage as each language writes it: 2.5 in English, 2,5 in French. */
export function formatPct(value: number, lang: string): string {
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 2 }).format(value);
}
