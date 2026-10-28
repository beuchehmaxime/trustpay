/**
 * Server-side i18n for the public marketing site.
 *
 * The logged-in app translates on the client through react-i18next, which works
 * there because the whole app is a client tree. The marketing pages are server
 * components - they have to render translated HTML in the first response so
 * crawlers see French on French URLs - so they cannot use those hooks. This is
 * the server-side equivalent, reading the very same locale files under a
 * `marketing` namespace, as the SEO brief requires.
 *
 * Language lives in the URL rather than in localStorage, because `hreflang`
 * needs one address per language. English is unprefixed so existing links keep
 * working; French sits under `/fr`.
 */
import en from '@/lib/i18n/locales/en.json';
import fr from '@/lib/i18n/locales/fr.json';

export const MARKETING_LANGS = ['en', 'fr'] as const;
export type Lang = (typeof MARKETING_LANGS)[number];

export const DEFAULT_LANG: Lang = 'en';

/** The `lang` attribute and `hreflang` value for each language. */
export const HTML_LANG: Record<Lang, string> = { en: 'en', fr: 'fr' };

const DICTIONARIES: Record<Lang, unknown> = { en, fr };

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'fr';
}

/** Narrow an unknown route param to a language, falling back to English. */
export function toLang(value: unknown): Lang {
  return isLang(value) ? value : DEFAULT_LANG;
}

function lookup(dictionary: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined,
      dictionary,
    );
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * Warn once per missing key. These pages are server-rendered on every request,
 * so warning every time would bury the log under one repeated line.
 */
const reportedMissing = new Set<string>();

function reportMissingKey(key: string): void {
  if (reportedMissing.has(key)) return;
  reportedMissing.add(key);
  console.warn(`[marketing i18n] missing translation for "${key}" - the page will show the raw key`);
}

export interface Translator {
  /** A single string. Falls back to English, then to the key itself. */
  (path: string, vars?: Record<string, string | number>): string;
  /** An array of strings - used for lists of bullets. */
  list: (path: string) => string[];
  /** An array of objects - used for cards, steps, FAQ entries. */
  items: <T = Record<string, string>>(path: string) => T[];
  lang: Lang;
}

/**
 * Build a translator for one language. Every lookup is prefixed with
 * `marketing.` so the app's own keys and the site's cannot collide.
 *
 * A missing French string falls back to the English one rather than rendering
 * a raw key: a page that is briefly half-translated is a far smaller problem
 * than one showing `marketing.pricing.title` to a visitor.
 */
export function getTranslator(lang: Lang): Translator {
  const primary = DICTIONARIES[lang] ?? DICTIONARIES[DEFAULT_LANG];

  const translate = ((path: string, vars?: Record<string, string | number>) => {
    const key = `marketing.${path}`;
    const value = lookup(primary, key) ?? lookup(DICTIONARIES[DEFAULT_LANG], key);
    if (typeof value !== 'string') {
      // Missing from BOTH dictionaries: the page will paint the raw key (that is
      // how `nav.home` reached production). Nothing better can be rendered, but
      // say so in the log so it is caught before a visitor sees it.
      reportMissingKey(key);
      return path;
    }
    return interpolate(value, vars);
  }) as Translator;

  translate.list = (path: string) => {
    const key = `marketing.${path}`;
    const value = lookup(primary, key) ?? lookup(DICTIONARIES[DEFAULT_LANG], key);
    return Array.isArray(value) ? (value as string[]) : [];
  };

  translate.items = <T,>(path: string) => {
    const key = `marketing.${path}`;
    const value = lookup(primary, key) ?? lookup(DICTIONARIES[DEFAULT_LANG], key);
    return Array.isArray(value) ? (value as T[]) : [];
  };

  translate.lang = lang;
  return translate;
}

/**
 * Turn an app-absolute path into one for the given language. English keeps the
 * bare path; French gains the `/fr` prefix. Anything already prefixed, external
 * or a fragment is returned untouched.
 */
export function localeHref(lang: Lang, href: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  if (lang === DEFAULT_LANG) return href;
  if (href === '/') return `/${lang}`;
  if (href.startsWith(`/${lang}/`) || href === `/${lang}`) return href;
  return `/${lang}${href}`;
}

/**
 * Strip a language prefix, giving the path as English would address it. `/en`
 * is stripped as well as `/fr`: a rewritten request can surface either form
 * depending on whether the pathname is read on the server or in the browser,
 * and both must reduce to the same bare path for the switcher to work.
 */
export function stripLocale(pathname: string): string {
  for (const lang of MARKETING_LANGS) {
    if (pathname === `/${lang}`) return '/';
    if (pathname.startsWith(`/${lang}/`)) return pathname.slice(lang.length + 1);
  }
  return pathname;
}

/**
 * The `alternates` block for a page's metadata: a canonical for this language
 * plus an `hreflang` entry per language, which is what lets both versions be
 * indexed separately instead of competing as duplicates.
 */
export function alternatesFor(lang: Lang, path: string) {
  const languages: Record<string, string> = {};
  for (const candidate of MARKETING_LANGS) {
    languages[HTML_LANG[candidate]] = localeHref(candidate, path);
  }
  languages['x-default'] = localeHref(DEFAULT_LANG, path);
  return { canonical: localeHref(lang, path), languages };
}
