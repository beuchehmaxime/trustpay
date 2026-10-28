'use client';

import { useEffect } from 'react';

import type { Lang } from './i18n';

/**
 * Keeps `<html lang>` matching the page after an in-app language switch.
 *
 * The root layout sets `<html lang>` on the server, but switching EN/FR with the
 * toggle is a client-side navigation and Next does not re-render the root layout
 * for it - so the attribute kept saying "en" on French pages. Screen readers pick
 * their pronunciation from it, so it has to follow the page.
 *
 * (Styling does not depend on this: the marketing shell carries its own `lang`
 * attribute, which re-renders with the `[lang]` segment.)
 */
export function HtmlLangSync({ lang }: { lang: Lang }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
