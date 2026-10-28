import { Request, Response } from 'express';
import { z } from 'zod';

import { asyncHandler, AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';

/**
 * Admin authoring for the SEO blog. Gated by `support.manage` (content sits
 * with the support/help surface). Lists include drafts; the public site only
 * ever serves published posts (see content.service).
 */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

const postSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().max(90).optional(),
  excerpt: z.string().min(1).max(500),
  body: z.string().min(1),
  category: z.string().min(1).max(60).default('guides'),
  categoryLabel: z.string().min(1).max(80).default('Guides'),
  coverImage: z.string().max(500).nullish(),
  author: z.string().max(120).nullish(),
  readMinutes: z.number().int().min(1).max(60).default(4),
  seoTitle: z.string().max(200).nullish(),
  seoDescription: z.string().max(320).nullish(),
  // Each language version is its own post; translationKey is the slug of the
  // original, and links them for hreflang and the language switcher.
  lang: z.enum(['en', 'fr']).default('en'),
  translationKey: z.string().max(90).nullish(),
  published: z.boolean().default(false),
});

export const BlogAdminController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const posts = await prisma.blogPost.findMany({
      orderBy: [{ updatedAt: 'desc' }],
    });
    res.json(posts);
  }),

  detail: asyncHandler(async (req: Request, res: Response) => {
    const post = await prisma.blogPost.findUnique({ where: { id: String(req.params.id) } });
    if (!post) throw new AppError(404, 'Q-404', 'Post not found.');
    res.json(post);
  }),

  create: asyncHandler(async (req: Request & { userId?: string }, res: Response) => {
    const input = postSchema.parse(req.body);
    const slug = slugify(input.slug || input.title);
    const exists = await prisma.blogPost.findUnique({ where: { slug } });
    if (exists) throw new AppError(409, 'Q-409', 'A post with that slug already exists.');
    const post = await prisma.blogPost.create({
      data: {
        slug,
        title: input.title,
        excerpt: input.excerpt,
        body: input.body,
        category: input.category,
        categoryLabel: input.categoryLabel,
        coverImage: input.coverImage ?? null,
        author: input.author ?? null,
        readMinutes: input.readMinutes,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        lang: input.lang,
        translationKey: input.translationKey ? slugify(input.translationKey) : null,
        published: input.published,
        publishedAt: input.published ? new Date() : null,
        createdById: req.userId ?? null,
      },
    });
    res.status(201).json(post);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Q-404', 'Post not found.');
    const input = postSchema.partial().parse(req.body);

    const slug = input.slug ? slugify(input.slug) : undefined;
    if (slug && slug !== existing.slug) {
      const clash = await prisma.blogPost.findUnique({ where: { slug } });
      if (clash) throw new AppError(409, 'Q-409', 'A post with that slug already exists.');
    }
    // Stamp publishedAt the first time a post goes live.
    const goingLive = input.published === true && !existing.published;

    const post = await prisma.blogPost.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(slug ? { slug } : {}),
        ...(input.excerpt !== undefined ? { excerpt: input.excerpt } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.categoryLabel !== undefined ? { categoryLabel: input.categoryLabel } : {}),
        ...(input.coverImage !== undefined ? { coverImage: input.coverImage ?? null } : {}),
        ...(input.author !== undefined ? { author: input.author ?? null } : {}),
        ...(input.readMinutes !== undefined ? { readMinutes: input.readMinutes } : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle ?? null } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription ?? null } : {}),
        ...(input.lang !== undefined ? { lang: input.lang } : {}),
        ...(input.translationKey !== undefined
          ? { translationKey: input.translationKey ? slugify(input.translationKey) : null }
          : {}),
        ...(input.published !== undefined ? { published: input.published } : {}),
        ...(goingLive ? { publishedAt: new Date() } : {}),
      },
    });
    res.json(post);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Q-404', 'Post not found.');
    await prisma.blogPost.delete({ where: { id } });
    res.json({ deleted: true, id });
  }),
};
