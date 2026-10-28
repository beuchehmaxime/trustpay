import { Request, Response } from 'express';
import { LegalDocType } from '@prisma/client';
import { z } from 'zod';

import { asyncHandler, AppError } from '../lib/errors';
import { ContentService } from './content.service';

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  topic: z.string().trim().max(120).optional(),
  message: z.string().trim().min(5).max(5000),
  // Honeypot - real users never fill this hidden field.
  website: z.string().optional(),
});

/** URL slugs used on the public site → LegalDocType. */
const LEGAL_SLUGS: Record<string, LegalDocType> = {
  'terms-of-service': 'TERMS',
  terms: 'TERMS',
  'privacy-policy': 'PRIVACY',
  privacy: 'PRIVACY',
  'cookie-policy': 'COOKIE',
  cookie: 'COOKIE',
  'aml-kyc-policy': 'AML_POLICY',
  'aml-kyc': 'AML_POLICY',
  'dispute-policy': 'DISPUTE',
  dispute: 'DISPUTE',
};

export const ContentController = {
  blogList: asyncHandler(async (req: Request, res: Response) => {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const lang = typeof req.query.lang === 'string' ? req.query.lang : undefined;
    res.json(await ContentService.blogPosts({ category, limit, lang }));
  }),

  blogCategories: asyncHandler(async (req: Request, res: Response) => {
    const lang = typeof req.query.lang === 'string' ? req.query.lang : undefined;
    res.json(await ContentService.blogCategories(lang));
  }),

  fees: asyncHandler(async (_req: Request, res: Response) => {
    res.json(ContentService.fees());
  }),

  countries: asyncHandler(async (_req: Request, res: Response) => {
    res.json(ContentService.countries());
  }),

  blogPost: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ContentService.blogPost(String(req.params.slug)));
  }),

  helpList: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await ContentService.helpArticles());
  }),

  helpArticle: asyncHandler(async (req: Request, res: Response) => {
    res.json(await ContentService.helpArticle(String(req.params.slug)));
  }),

  legal: asyncHandler(async (req: Request, res: Response) => {
    const key = String(req.params.type).toLowerCase();
    const type = LEGAL_SLUGS[key];
    if (!type) throw new AppError(404, 'Q-404', 'Unknown legal document.');
    res.json(await ContentService.legal(type));
  }),

  contact: asyncHandler(async (req: Request, res: Response) => {
    const input = contactSchema.parse(req.body);
    // Silently accept honeypot hits so bots get no signal.
    if (input.website && input.website.trim()) {
      res.json({ ok: true });
      return;
    }
    res.json(
      await ContentService.submitContact({
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        topic: input.topic ?? null,
        message: input.message,
      }),
    );
  }),
};
