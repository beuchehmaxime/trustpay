import { LegalDocType } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { BLOG_POSTS_I18N } from './seed-blog-i18n';
import { BLOG_POSTS, HELP_ARTICLES, LEGAL_DOCS } from './seed-data';

/** Help slugs that carried the old brand name, renamed in place. */
const RENAMED_HELP_SLUGS: Record<string, string> = {
  'what-is-qatiqa': 'what-is-bizik',
  'what-is-my-qatiqa-handle': 'what-is-my-bizik-handle',
  'can-i-use-qatiqa-entirely-on-whatsapp': 'can-i-use-bizik-entirely-on-whatsapp',
  'what-is-my-qatiqa-wallet': 'what-is-my-bizik-wallet',
  'what-does-qatiqa-charge': 'what-does-bizik-charge',
  'how-do-i-contact-qatiqa': 'how-do-i-contact-bizik',
};

/**
 * Markers that only appear in the untouched first import of the English posts:
 * links to the old staging site and claims the product does not keep (card
 * funding, a fixed ruling deadline). A seeded row still containing one is
 * replaced with the corrected body.
 */
const LEGACY_BODY_MARKERS = [
  'shasha.dreamscomtrue.pw',
  '/use-cases/',
  'within 48 hours',
  'rules within 48 hours',
  'a card or a bank transfer',
  'choose who covers it',
];

/**
 * Seed the public marketing content - blog posts, help-centre articles and the
 * legal documents - from the Bizik website bundle. Idempotent and edit-safe:
 * blog/help rows are only created when their slug is missing (never clobbering
 * an operator's edits), and legal docs are refreshed from the bundle only while
 * they have never been touched in the admin console (`updatedById` is null).
 */
export async function seedContent(): Promise<void> {
  // ---- Blog posts (original English import) ----
  for (const post of BLOG_POSTS) {
    const existing = await prisma.blogPost.findUnique({ where: { slug: post.slug } });
    if (existing) {
      const isLegacy = LEGACY_BODY_MARKERS.some((marker) => existing.body.includes(marker));
      if (isLegacy && !existing.createdById) {
        await prisma.blogPost.update({ where: { slug: post.slug }, data: { body: post.body } });
      }
      continue;
    }
    await prisma.blogPost.create({
      data: {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        body: post.body,
        category: post.category,
        categoryLabel: post.categoryLabel,
        readMinutes: post.readMinutes,
        lang: 'en',
        translationKey: post.slug,
        published: true,
        publishedAt: post.publishedAt ? new Date(post.publishedAt) : new Date(),
      },
    });
  }

  // ---- Blog posts (bilingual set) ----
  for (const post of BLOG_POSTS_I18N) {
    const exists = await prisma.blogPost.findUnique({ where: { slug: post.slug } });
    if (exists) continue;
    await prisma.blogPost.create({
      data: {
        slug: post.slug,
        lang: post.lang,
        translationKey: post.translationKey,
        title: post.title,
        excerpt: post.excerpt,
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
        body: post.body,
        category: post.category,
        categoryLabel: post.categoryLabel,
        readMinutes: post.readMinutes,
        published: true,
        publishedAt: new Date(post.publishedAt),
      },
    });
  }

  // ---- Help-centre articles ----
  // Remove the old placeholder demo articles (from the generic support seed) so
  // the public help centre shows only the real Bizik content bundle.
  await prisma.helpArticle.deleteMany({
    where: {
      slug: {
        in: ['how-escrow-works', 'verifying-your-identity', 'withdrawing-funds', 'understanding-fees', 'filing-a-dispute'],
      },
    },
  });
  for (const [oldSlug, newSlug] of Object.entries(RENAMED_HELP_SLUGS)) {
    const [oldRow, newRow] = await Promise.all([
      prisma.helpArticle.findUnique({ where: { slug: oldSlug } }),
      prisma.helpArticle.findUnique({ where: { slug: newSlug } }),
    ]);
    if (oldRow && !newRow) {
      await prisma.helpArticle.update({ where: { slug: oldSlug }, data: { slug: newSlug } });
    }
  }
  for (const article of HELP_ARTICLES) {
    const exists = await prisma.helpArticle.findUnique({ where: { slug: article.slug } });
    if (exists) continue;
    await prisma.helpArticle.create({
      data: {
        slug: article.slug,
        title: article.title,
        category: article.category,
        body: article.body,
        order: article.order,
        published: true,
      },
    });
  }

  // ---- Legal documents ----
  for (const doc of LEGAL_DOCS) {
    const existing = await prisma.legalDocument.findUnique({
      where: { type: doc.type as LegalDocType },
    });
    if (!existing) {
      await prisma.legalDocument.create({
        data: {
          type: doc.type as LegalDocType,
          title: doc.title,
          content: doc.content,
          version: '1.0',
          published: true,
          effectiveAt: new Date(),
        },
      });
    } else if (!existing.updatedById || !existing.published) {
      // Never edited by an operator, or still unpublished - safe to (re)fill
      // from the bundle so every legal page has real, published content.
      await prisma.legalDocument.update({
        where: { type: doc.type as LegalDocType },
        data: { title: doc.title, content: doc.content, published: true },
      });
    }
  }

  console.log(
    `[content] seeded: ${BLOG_POSTS.length + BLOG_POSTS_I18N.length} posts, ${HELP_ARTICLES.length} help articles, ${LEGAL_DOCS.length} legal docs`,
  );
}
