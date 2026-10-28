'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { stripLocale } from './i18n';

export interface NavItem {
  href: string;
  label: string;
}

/**
 * The primary navigation links, marking the page you are on.
 *
 * This is the only part of the header that needs the current route, so it is
 * the only part that becomes a client component - the header itself stays on
 * the server. It still renders to HTML on the first response, so the links are
 * in the markup for crawlers either way.
 *
 * Labels and hrefs arrive already translated and already language-prefixed from
 * the server, so nothing here has to know which language is being rendered.
 */
export function NavLinks({ className, items }: { className?: string; items: NavItem[] }) {
  const pathname = usePathname();

  /**
   * A section is current when you are on its page or anywhere beneath it, so
   * an article keeps "Blog" lit. "/" would otherwise prefix-match everything,
   * so it has to be exact. Both sides are compared without their language
   * prefix, so /fr/pricing lights the same item /pricing does.
   */
  const currentPath = stripLocale(pathname ?? '/');
  const isCurrent = (href: string) => {
    const target = stripLocale(href);
    return target === '/'
      ? currentPath === '/'
      : currentPath === target || currentPath.startsWith(`${target}/`);
  };

  return (
    <ul className={className}>
      {items.map((item) => {
        const current = isCurrent(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={current ? 'is-current' : undefined}
              aria-current={current ? 'page' : undefined}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
