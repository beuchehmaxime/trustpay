import { notFound } from 'next/navigation';

/**
 * Any marketing address that matches no page lands here and immediately hands
 * off to `[lang]/not-found.tsx`.
 *
 * Without this, an unknown path under `[lang]` falls past the segment to the
 * root not-found, which renders outside the site's header and footer and in the
 * wrong language. Routing it through the segment keeps the visitor on the site,
 * in their language, with a real 404 status.
 */
export default function MissingMarketingPage(): never {
  notFound();
}
