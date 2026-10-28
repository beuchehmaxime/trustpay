'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MARKETING_LANGS, localeHref, stripLocale, type Lang } from './i18n';

/**
 * The EN / FR toggle.
 *
 * Each choice is a real link to the same page in the other language, not a
 * client-side state flip: the language is part of the URL, so switching has to
 * navigate. That also means the choice can be shared, bookmarked and crawled.
 *
 * It needs the current route to know what "the same page" is, which is the only
 * reason this is a client component while the rest of the header is not.
 */
export function LangSwitch({
  lang,
  label,
  className,
}: {
  lang: Lang;
  label: string;
  /** Extra class for a placement variant, e.g. the mobile menu's larger toggle. */
  className?: string;
}) {
  const pathname = usePathname() ?? '/';
  const barePath = stripLocale(pathname);

  return (
    <div className={className ? `q-lang ${className}` : 'q-lang'} role="group" aria-label={label}>
      {MARKETING_LANGS.map((candidate) => {
        const isActive = candidate === lang;
        return (
          <Link
            key={candidate}
            href={localeHref(candidate, barePath)}
            hrefLang={candidate}
            className={isActive ? 'is-active' : undefined}
            aria-current={isActive ? 'true' : undefined}
          >
            {candidate.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
