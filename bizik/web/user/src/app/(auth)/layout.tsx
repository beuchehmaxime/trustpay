'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import Image from 'next/image';
import { Lock } from 'lucide-react';

import { AuthBrandPanel } from '@/components/auth/brand-panel';
import { AuthLangToggle } from '@/components/auth/auth-lang-toggle';

/**
 * Responsive auth shell serving both breakpoints from one tree:
 * - Mobile (< lg): the original single-column brand gradient with white text -
 *   wordmark + language toggle header, the centred form, and a trust footer.
 * - Desktop (lg+): a two-panel split - the marketing brand panel on the left,
 *   the form on a light surface on the right.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] bg-hero-gradient text-white lg:h-svh lg:grid-cols-2 lg:overflow-hidden lg:bg-none lg:text-ink">
      <AuthBrandPanel />

      {/* Form column - transparent over the gradient on mobile, white on desktop. */}
      <div className="relative flex min-w-0 flex-col lg:min-h-0 lg:overflow-y-auto lg:bg-white">
        {/* Header: wordmark (mobile carries the logo; the brand panel does on desktop)
            + language toggle (always reachable). */}
        <header className="flex items-center justify-between px-5 pt-6 lg:py-4">
          <Link href="/" className="lg:invisible" aria-label="Bizik home">
            <Image
              src="/brand/logo-landscape.png"
              alt="Bizik"
              width={4647}
              height={1491}
              priority
              className="h-8 w-auto"
            />
          </Link>
          <AuthLangToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-5 py-5 sm:px-10">
          <div className="w-full max-w-[520px]">{children}</div>
        </main>

        {/* Trust footer - mobile only; the brand panel is the desktop trust surface. */}
        <footer className="flex items-center justify-center gap-2 px-5 pb-6 text-center text-[12px] font-medium text-white/80 lg:hidden">
          <Lock className="size-3.5 shrink-0" />
          {t('auth.trustFooter')}
        </footer>
      </div>
    </div>
  );
}
