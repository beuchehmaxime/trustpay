/**
 * Builds /llms.txt and /llms-full.txt (https://llmstxt.org): a plain-text map
 * of the site for AI assistants and answer engines. Everything is generated
 * from live data - fees from the admin settings, posts and help articles from
 * the content API - so the file never drifts from what the site says.
 *
 * Only verifiable facts belong here. Assistants repeat this text verbatim, so
 * a claim that is not true of the product today must not appear.
 */
import {
  fetchBlogPosts,
  fetchBlogPost,
  fetchHelpArticles,
  formatPct,
  loadFees,
  type BlogPostSummary,
  type PublicFees,
} from './data';
import { SITE, SUPPORT_EMAILS } from './site';

const PAGES: { path: string; en: string; fr: string; about: string }[] = [
  { path: '/', en: 'Home', fr: 'Accueil', about: 'What Bizik is and who it is for' },
  { path: '/how-it-works', en: 'How it works', fr: 'Comment ça marche', about: 'The deal lifecycle from creation to release, and disputes' },
  { path: '/pricing', en: 'Pricing', fr: 'Tarifs', about: 'Every fee, with a calculator' },
  { path: '/send-money', en: 'Send money', fr: "Envoyer de l'argent", about: 'Free, instant wallet transfers to a @handle or phone number' },
  { path: '/receive-money', en: 'Receive money', fr: "Recevoir de l'argent", about: 'Get paid with a @handle and withdraw to MTN MoMo or Orange Money' },
  { path: '/security', en: 'Security', fr: 'Sécurité', about: 'How deal money and accounts are protected' },
  { path: '/for-freelancers', en: 'For freelancers', fr: 'Pour les freelances', about: 'Milestone escrow for freelance and service work' },
  { path: '/for-business', en: 'For business', fr: 'Pour les entreprises', about: 'Escrow for online sellers and businesses' },
  { path: '/about', en: 'About', fr: 'À propos', about: 'The company behind Bizik' },
  { path: '/contact', en: 'Contact', fr: 'Contact', about: 'Support, business, press and security contacts' },
  { path: '/help-centre', en: 'Help centre', fr: "Centre d'aide", about: 'Answers about deals, money, verification, disputes and security' },
  { path: '/blog', en: 'Blog', fr: 'Blog', about: 'Guides and scam alerts for buying, selling and hiring online in Cameroon' },
];

const LEGAL: { path: string; title: string }[] = [
  { path: '/terms-of-service', title: 'Terms of service' },
  { path: '/privacy-policy', title: 'Privacy policy' },
  { path: '/cookie-policy', title: 'Cookie policy' },
  { path: '/aml-kyc-policy', title: 'AML / KYC policy' },
  { path: '/dispute-policy', title: 'Dispute policy' },
];

const url = (path: string) => `${SITE.url}${path === '/' ? '' : path}`;
const frUrl = (path: string) => `${SITE.url}/fr${path === '/' ? '' : path}`;
const postUrl = (post: BlogPostSummary) =>
  post.lang === 'fr' ? frUrl(`/blog/${post.slug}`) : url(`/blog/${post.slug}`);

function feeLines(fees: PublicFees): string[] {
  const pct = (value: number) => `${formatPct(value, 'en')}%`;
  return [
    `- Escrow fee: ${pct(fees.buyerPct)} of the deal amount, paid by the buyer on top of the amount when the deal is funded.`,
    fees.sellerPct === 0
      ? '- Seller fee: none. The seller receives the full deal amount on release.'
      : `- Seller fee: ${pct(fees.sellerPct)} of the deal amount, deducted on release.`,
    `- Currency conversion: +${pct(fees.fxMarginPct)} over the mid-market rate, shown before confirming.`,
    `- Minimum withdrawal: the equivalent of USD ${fees.minWithdrawalUsd}.`,
    '- No subscription, no account fee, no fee to create a deal or to open a dispute.',
    '- Example: on a 100,000 XAF deal the buyer pays ' +
      `${Math.round(100000 * (1 + fees.buyerPct / 100)).toLocaleString('en-US')} XAF and the seller receives ` +
      `${Math.round(100000 * (1 - fees.sellerPct / 100)).toLocaleString('en-US')} XAF.`,
    '- Mobile-money operators may charge their own cash-in or cash-out fees; those are not Bizik fees.',
  ];
}

function overview(fees: PublicFees): string {
  return [
    `# ${SITE.name}`,
    '',
    '> Bizik is an escrow payment service for Cameroon: the buyer pays Bizik, Bizik holds the money until the goods arrive or the work is delivered and approved, then pays the seller. Funding is by MTN Mobile Money or Orange Money. The site and product are available in English and French.',
    '',
    'Bizik (bizik.cm) is operated by Lyftsoft Technologies, a company registered in Cameroon, with an office in Douala. It is built for deals between people who do not know each other: buying and selling on WhatsApp, Facebook Marketplace and Instagram, used phones and cars, freelance and service work, and rental deposits. In French, escrow is "séquestre" or "paiement sous séquestre".',
    '',
    '## Key facts',
    '',
    '- Service: escrow (third-party holding of a payment until both sides have done what they agreed).',
    '- Country: Cameroon, CEMAC region. Main currency: XAF (FCFA). The Bizik wallet can also hold USD, EUR, GBP, NGN and GHS.',
    '- Languages: English and French.',
    '- Paying into a deal: MTN Mobile Money, Orange Money, or the Bizik wallet balance. Card payments are not offered.',
    '- Getting paid: released funds go to the seller\'s Bizik wallet and can be withdrawn to MTN Mobile Money or Orange Money. Withdrawals of 500,000 XAF or more to mobile money are reviewed by a person before payout.',
    '- Sending money: free, instant transfers from one Bizik wallet to another, to a @handle or a phone number. The recipient needs a Bizik account. Transfers are final and cannot be reversed; for paying strangers, use an escrow deal.',
    '- Receiving money: share a @handle; no verification is needed to receive. There is no request-money feature, payment link or QR code.',
    '- Identity verification (KYC) is required before sending or withdrawing money, and before creating a deal.',
    '- Channels: the website and web app at bizik.cm, and a WhatsApp assistant.',
    '',
    '## How a deal works',
    '',
    '1. Either party creates the deal: what is sold or delivered, the price, the delivery date, an inspection window of 3 to 14 days, and optional milestones. The other party is invited by phone number.',
    '2. The buyer funds the deal into escrow. Both sides are notified when the money lands; the seller sees it is locked for them.',
    '3. The seller delivers and marks the deal (or milestone) as delivered, with proof such as photos, tracking or files.',
    '4. The buyer inspects, then approves or requests a revision within the agreed limit.',
    '5. On approval the money is released to the seller. If the buyer does nothing before the inspection window ends, the funds release automatically.',
    '6. If something is wrong, either side can open a dispute before release. The money stays frozen, both sides submit evidence, and a Bizik mediator rules: release to the seller, refund to the buyer, or a split.',
    '',
    '## Fees (live)',
    '',
    ...feeLines(fees),
    '',
    '## Contact',
    '',
    `- Support: ${SUPPORT_EMAILS.support}`,
    `- Business and partnerships: ${SUPPORT_EMAILS.business}`,
    `- Press: ${SUPPORT_EMAILS.press}`,
    `- Security reports: ${SUPPORT_EMAILS.security}`,
    `- Contact page: ${url('/contact')}`,
  ].join('\n');
}

function pageLinks(): string {
  return [
    '## Pages (English)',
    '',
    ...PAGES.map((page) => `- [${page.en}](${url(page.path)}): ${page.about}`),
    '',
    '## Pages (français)',
    '',
    ...PAGES.map((page) => `- [${page.fr}](${frUrl(page.path)})`),
  ].join('\n');
}

function postLinks(title: string, posts: BlogPostSummary[]): string {
  if (posts.length === 0) return '';
  return [`## ${title}`, '', ...posts.map((post) => `- [${post.title}](${postUrl(post)}): ${post.excerpt}`)].join('\n');
}

async function loadPosts() {
  const [english, french] = await Promise.all([
    fetchBlogPosts({ lang: 'en' }).catch(() => []),
    fetchBlogPosts({ lang: 'fr' }).catch(() => []),
  ]);
  return { english, french };
}

/** /llms.txt - the short index. */
export async function buildLlmsTxt(): Promise<string> {
  const [fees, posts, articles] = await Promise.all([
    loadFees(),
    loadPosts(),
    fetchHelpArticles().catch(() => []),
  ]);
  return [
    overview(fees),
    pageLinks(),
    postLinks('Blog (English)', posts.english),
    postLinks('Blog (français)', posts.french),
    articles.length
      ? ['## Help centre', '', ...articles.map((article) => `- [${article.title}](${url(`/help-centre/${article.slug}`)})`)].join('\n')
      : '',
    ['## Legal', '', ...LEGAL.map((doc) => `- [${doc.title}](${url(doc.path)})`)].join('\n'),
    ['## Optional', '', `- [Full text for language models](${url('/llms-full.txt')}): every article and help answer in one file`, `- [Sitemap](${url('/sitemap.xml')})`].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .concat('\n');
}

/** Help bodies are partly HTML (tables); flatten them to readable text. */
function toPlainText(markup: string): string {
  return markup
    .replace(/<\/(td|th)>\s*<(td|th)[^>]*>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** /llms-full.txt - the index plus the full text of every article. */
export async function buildLlmsFullTxt(): Promise<string> {
  const [fees, posts, articles] = await Promise.all([
    loadFees(),
    loadPosts(),
    fetchHelpArticles().catch(() => []),
  ]);
  const allPosts = [...posts.english, ...posts.french];
  const bodies = await Promise.all(allPosts.map((post) => fetchBlogPost(post.slug)));

  const postSections = allPosts.map((post, index) => {
    const body = bodies[index]?.body ?? post.excerpt;
    return [`### ${post.title}`, '', `URL: ${postUrl(post)}`, `Language: ${post.lang}`, '', body.trim()].join('\n');
  });
  const helpSections = articles.map((article) =>
    [`### ${article.title}`, '', `URL: ${url(`/help-centre/${article.slug}`)}`, '', toPlainText(article.body)].join('\n'),
  );

  return [
    overview(fees),
    pageLinks(),
    ['## Blog articles, full text', '', ...postSections].join('\n\n'),
    helpSections.length ? ['## Help centre, full text', '', ...helpSections].join('\n\n') : '',
    ['## Legal', '', ...LEGAL.map((doc) => `- [${doc.title}](${url(doc.path)})`)].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
    .concat('\n');
}
