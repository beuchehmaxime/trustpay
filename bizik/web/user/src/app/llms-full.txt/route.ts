import { buildLlmsFullTxt } from '../(marketing)/_bizik/llms';

export const dynamic = 'force-dynamic';

/** /llms-full.txt - llms.txt plus the full text of every article and help answer. */
export async function GET() {
  return new Response(await buildLlmsFullTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
