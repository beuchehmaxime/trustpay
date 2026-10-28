import { LegalDocType } from '@prisma/client';

import { countryCodeFor, flagFor } from '../lib/domain';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { emitAdminEvent } from '../lib/admin-events';
import { sendEmail } from '../lib/notify';
import { feeSettings } from '../lib/settings';
import { systemSettings } from '../lib/system-settings';

/**
 * Public, unauthenticated content for the marketing site: blog posts, help
 * articles and legal documents. Only PUBLISHED rows are ever returned here -
 * drafts live behind the admin console. Bodies are markdown (rendered client
 * side). This is the read side; authoring is in content.admin / supportadmin.
 */

function blogListItem(post: {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  categoryLabel: string;
  coverImage: string | null;
  author: string | null;
  readMinutes: number;
  lang: string;
  translationKey: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}) {
  return {
    slug: post.slug,
    lang: post.lang,
    // A post with no counterpart groups with itself.
    translationKey: post.translationKey ?? post.slug,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    categoryLabel: post.categoryLabel,
    coverImage: post.coverImage,
    author: post.author,
    readMinutes: post.readMinutes,
    publishedAt: (post.publishedAt ?? post.createdAt).toISOString(),
  };
}

/** Only the languages the site publishes; anything else reads as English. */
function blogLang(lang?: string): string {
  return lang === 'fr' ? 'fr' : 'en';
}

export const ContentService = {
  // ---- Blog ----
  async blogPosts(opts: { category?: string; limit?: number; lang?: string } = {}) {
    const posts = await prisma.blogPost.findMany({
      where: {
        published: true,
        lang: blogLang(opts.lang),
        ...(opts.category ? { category: opts.category } : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      // Capped: this endpoint is public and returns full post bodies.
      take: Math.min(Math.max(opts.limit ?? 50, 1), 100),
    });
    return posts.map(blogListItem);
  },

  async blogCategories(lang?: string) {
    const rows = await prisma.blogPost.groupBy({
      by: ['category', 'categoryLabel'],
      where: { published: true, lang: blogLang(lang) },
      _count: { _all: true },
    });
    return rows
      .map((row) => ({ slug: row.category, label: row.categoryLabel, count: row._count._all }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },

  async blogPost(slug: string) {
    const post = await prisma.blogPost.findFirst({ where: { slug, published: true } });
    if (!post) throw new AppError(404, 'Q-404', 'Article not found.');

    // Every published language version of this article, so the page can link
    // them with hreflang and send a reader to the version in their language.
    const key = post.translationKey ?? post.slug;
    const versions = await prisma.blogPost.findMany({
      where: { published: true, OR: [{ translationKey: key }, { slug: key }] },
      select: { lang: true, slug: true },
    });
    const alternates = Object.fromEntries(versions.map((version) => [version.lang, version.slug]));

    return {
      ...blogListItem(post),
      alternates,
      body: post.body,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      updatedAt: post.updatedAt.toISOString(),
    };
  },

  /**
   * What Bizik actually charges, as percentages. The marketing calculator and
   * llms.txt read this instead of hardcoding numbers, because fees are edited
   * in the admin console and a hardcoded copy silently goes stale.
   */
  fees() {
    // Express withdrawal is deliberately NOT published. The rate exists in
    // settings and the fee helper still computes it, but no screen offers the
    // choice and nothing in the payout path treats an express request
    // differently - it is recorded and then processed in the same queue, at the
    // same speed, as any other. Publishing a price for that would be charging
    // for a service that does not exist. Put it back when the withdraw screen
    // can request it AND the queue honours it.
    const fees = feeSettings();
    const percent = (fraction: number) => Math.round(fraction * 10000) / 100;
    return {
      buyerPct: percent(fees.clientServicePct),
      sellerPct: percent(fees.freelancerFeePct),
      fxMarginPct: percent(fees.fxMarginPct),
      minWithdrawalUsd: fees.minWithdrawalUsd,
    };
  },

  /**
   * The countries BiZik currently accepts, for every signup/KYC country picker.
   *
   * This exists because the list was previously nowhere the clients could see
   * it: the PWA had no list at all, so its KYC screen showed the account's
   * stored country as read-only text - and since signup never asks for one,
   * that was always "-" and nobody could finish verification. Serving the
   * markets settings solves that once for all clients AND means an operator
   * disabling a market removes it from every picker immediately, instead of
   * users choosing a country the backend then refuses.
   *
   * Public on purpose: it is the same list printed on the marketing site, and
   * requiring a session would defeat the point of using it at signup.
   */
  countries() {
    return systemSettings()
      .markets.countries.filter((country) => country.enabled)
      .map((country) => {
        const code = countryCodeFor(country.name);
        return {
          name: country.name,
          code,
          flag: flagFor(code),
          // Clients prefill the phone field from this, so a picker cannot offer
          // a country whose numbers signup would then refuse.
          dialCode: country.dialCode,
          currency: country.currency,
          locale: country.locale,
        };
      });
  },

  // ---- Help centre ----
  async helpArticles() {
    const articles = await prisma.helpArticle.findMany({
      where: { published: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return articles.map((article) => ({
      slug: article.slug,
      title: article.title,
      category: article.category,
      body: article.body,
      order: article.order,
      updatedAt: article.updatedAt.toISOString(),
    }));
  },

  async helpArticle(slug: string) {
    const article = await prisma.helpArticle.findFirst({ where: { slug, published: true } });
    if (!article) throw new AppError(404, 'Q-404', 'Help article not found.');
    return {
      slug: article.slug,
      title: article.title,
      category: article.category,
      body: article.body,
      updatedAt: article.updatedAt.toISOString(),
    };
  },

  // ---- Contact form (public) ----
  async submitContact(input: {
    name: string;
    email: string;
    phone?: string | null;
    topic?: string | null;
    message: string;
  }) {
    const record = await prisma.contactMessage.create({
      data: {
        name: input.name.trim(),
        email: input.email.trim(),
        phone: input.phone?.trim() || null,
        topic: input.topic?.trim() || null,
        message: input.message.trim(),
      },
    });

    const supportEmail = systemSettings().general.supportEmail || 'support@bizik.cm';
    const body =
      `New contact message from the Bizik website\n\n` +
      `Name:    ${record.name}\n` +
      `Email:   ${record.email}\n` +
      `Phone:   ${record.phone ?? '-'}\n` +
      `Topic:   ${record.topic ?? '-'}\n\n` +
      `${record.message}\n`;

    // Best-effort: never let a mail/notify hiccup fail the visitor's submission.
    void sendEmail(supportEmail, `Contact: ${record.topic ?? 'General enquiry'}`, body).catch(
      (error) => console.error('[contact] email failed', (error as Error).message),
    );
    void emitAdminEvent({
      type: 'SYSTEM',
      severity: 'INFO',
      title: `New contact message${record.topic ? ` - ${record.topic}` : ''}`,
      body: `${record.name} (${record.email}) sent a message via the website.`,
      permission: 'support.view',
      entityType: 'ContactMessage',
      entityId: record.id,
    }).catch((error) => console.error('[contact] admin event failed', (error as Error).message));

    return { ok: true };
  },

  // ---- Legal ----
  async legal(type: LegalDocType) {
    const doc = await prisma.legalDocument.findFirst({ where: { type, published: true } });
    if (!doc) throw new AppError(404, 'Q-404', 'Document not found.');
    return {
      type: doc.type,
      title: doc.title,
      content: doc.content,
      version: doc.version,
      effectiveAt: doc.effectiveAt ? doc.effectiveAt.toISOString() : null,
      updatedAt: doc.updatedAt.toISOString(),
    };
  },
};
