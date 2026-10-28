import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { getTranslator, isLang, DEFAULT_LANG, type Lang } from './(marketing)/_bizik/i18n';
import { Poppins, Geist_Mono } from 'next/font/google';
import './globals.css';

import { Providers } from './providers';
import { InstallModal } from '@/components/pwa/install-modal';
import { AnalyticsTracker } from '@/components/analytics-tracker';
import { Toaster } from '@/components/ui/sonner';

const poppins = Poppins({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/** The language the middleware resolved for this request. */
async function requestLang(): Promise<Lang> {
  const value = (await headers()).get('x-bizik-lang');
  return isLang(value) ? value : DEFAULT_LANG;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslator(await requestLang());
  return {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bizik.cm'),
  title: {
    default: t('root.title'),
    template: '%s · Bizik',
  },
  description: t('root.description'),
  applicationName: 'Bizik',
  keywords: [
    'escrow',
    'secure escrow',
    'escrow WhatsApp',
    'Mobile Money escrow',
    'MTN MoMo',
    'Orange Money',
    'escrow Cameroon',
    'pay safely online',
    'freelancer escrow',
    'buyer seller protection',
  ],
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Bizik' },
  formatDetection: { telephone: false },
  icons: {
    // The brand mark. The placeholder /icon.svg it replaced was a generated
    // lettered tile, not the logo.
    icon: [{ url: '/brand/logo-icon.png', type: 'image/png' }],
    apple: [{ url: '/brand/logo-icon.png', type: 'image/png' }],
  },
  openGraph: {
    title: t('root.title'),
    description: t('root.ogDescription'),
    siteName: 'Bizik',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: t('root.title'),
    description: t('root.twitterDescription'),
  },
  };
}

export const viewport: Viewport = {
  themeColor: '#3b82f6',
  // Comfortable mobile viewport; allow a little zoom for accessibility.
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /**
   * The marketing pages carry their language in the route, but this layout sits
   * above that segment and cannot read its params. The middleware puts the
   * resolved language on a header instead, so <html lang> still matches the
   * page - which screen readers and search engines both rely on.
   */
  const htmlLang = await requestLang();

  return (
    <html
      lang={htmlLang}
      suppressHydrationWarning
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
        <InstallModal />
        <AnalyticsTracker />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
