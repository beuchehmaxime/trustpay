import { buildLlmsTxt } from '../(marketing)/_bizik/llms';

// Built per request (cached by the content fetches) so new posts and fee
// changes show up without a redeploy, like the sitemap.
export const dynamic = 'force-dynamic';

/** /llms.txt - a plain-text guide to the site for AI assistants (llmstxt.org). */
export async function GET() {
  return new Response(await buildLlmsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
