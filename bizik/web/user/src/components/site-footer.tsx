import Link from 'next/link';

import { Logo } from '@/components/logo';

const GROUPS = [
  {
    title: 'Product',
    links: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/login', label: 'Log in' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms' },
      { href: '/privacy', label: 'Privacy' },
    ],
  },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-hairline bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Secure escrow for freelancers and clients. Fund, approve, release -
            protected on every project.
          </p>
        </div>

        {GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="text-sm font-semibold text-ink">{group.title}</h3>
            <ul className="mt-3 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-brand-600"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>© {year} BiZik. All rights reserved.</span>
          <span>Payments protected by BiZik Escrow.</span>
        </div>
      </div>
    </footer>
  );
}
