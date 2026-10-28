/**
 * Shared configuration for the Bizik public marketing site. Single source of
 * truth for the wordmark, navigation, footer columns and external links so
 * every page and the header/footer stay in sync.
 */

export const SITE = {
  name: 'Bizik',
  tagline: 'Secure escrow for everyone',
  /** Public site origin - used for canonical URLs, sitemap and OG tags. */
  url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://bizik.cm').replace(/\/+$/, ''),
  loginUrl: '/login',
  signupUrl: '/register',
  whatsappUrl:
    process.env.NEXT_PUBLIC_WHATSAPP_URL ||
    'https://wa.me/237600000000?text=Hi%20Bizik%20-%20I%20want%20to%20start%20a%20secure%20deal.',
  appStoreUrl: '#',
  playStoreUrl: '#',
  social: {
    twitter: 'https://twitter.com/',
    linkedin: 'https://linkedin.com/',
    facebook: 'https://facebook.com/',
  },
  footerMarks: ['Bank-grade security', 'KYC verified', 'Segregated escrow'],
} as const;

export interface NavLink {
  label: string;
  href: string;
}

/** Primary header navigation. */
export const PRIMARY_NAV: NavLink[] = [
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Use cases', href: '/for-freelancers' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Security', href: '/security' },
  { label: 'Blog', href: '/blog' },
  { label: 'Help centre', href: '/help-centre' },
];

/**
 * Footer link columns. Titles and labels are translation keys under
 * `marketing.*` and hrefs are unprefixed; the footer translates and prefixes
 * them for the page's language so French pages link to French pages.
 */
export const FOOTER_COLUMNS: { titleKey: string; links: { labelKey: string; href: string }[] }[] = [
  {
    titleKey: 'footer.columns.product',
    links: [
      { labelKey: 'nav.howItWorks', href: '/how-it-works' },
      { labelKey: 'nav.sendMoney', href: '/send-money' },
      { labelKey: 'nav.receiveMoney', href: '/receive-money' },
      { labelKey: 'nav.pricing', href: '/pricing' },
      { labelKey: 'nav.security', href: '/security' },
    ],
  },
  {
    titleKey: 'footer.columns.useCases',
    links: [
      { labelKey: 'nav.forFreelancersPlain', href: '/for-freelancers' },
      { labelKey: 'nav.forBusiness', href: '/for-business' },
    ],
  },
  {
    titleKey: 'footer.columns.company',
    links: [
      { labelKey: 'nav.about', href: '/about' },
      { labelKey: 'nav.blog', href: '/blog' },
      { labelKey: 'nav.contact', href: '/contact' },
    ],
  },
  {
    titleKey: 'footer.columns.legalSupport',
    links: [
      { labelKey: 'nav.termsOfService', href: '/terms-of-service' },
      { labelKey: 'nav.privacyPolicy', href: '/privacy-policy' },
      { labelKey: 'nav.cookiePolicy', href: '/cookie-policy' },
      { labelKey: 'nav.amlKycPolicy', href: '/aml-kyc-policy' },
      { labelKey: 'nav.disputePolicy', href: '/dispute-policy' },
      { labelKey: 'nav.helpCentre', href: '/help-centre' },
    ],
  },
];


/** Published support addresses, by purpose. */
export const SUPPORT_EMAILS = {
  support: 'support@bizik.cm',
  business: 'business@bizik.cm',
  press: 'press@bizik.cm',
  security: 'security@bizik.cm',
} as const;
