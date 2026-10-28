import type { MetadataRoute } from 'next';

import { SITE } from './(marketing)/_bizik/site';

/** Logged-in app and auth routes: nothing there is useful to index. */
const PRIVATE_PATHS = ['/login', '/register', '/dashboard', '/wallet', '/deals', '/settings', '/offline'];

/**
 * AI crawlers and answer engines, named explicitly. They already fall under
 * `*`, but some only honour a group that names them, and listing them makes
 * the intent unambiguous: the public site is open to AI search and training
 * so assistants can find and describe Bizik accurately. A crawler obeys only
 * the most specific group that matches it, so each group repeats the
 * disallow list rather than inheriting it from `*`.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot',
  'Applebot-Extended',
  'Bingbot',
  'DuckAssistBot',
  'MistralAI-User',
  'meta-externalagent',
  'CCBot',
];

/** robots.txt - open the public site to search and AI crawlers, keep the
 *  logged-in app and auth routes out, and point at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
