import { z } from 'zod';

export const adminReplySchema = z.object({
  body: z.string().trim().min(1, 'Write a reply.').max(4000),
});

export const statusSchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']),
});

export const prioritySchema = z.object({
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
});

export const helpArticleSchema = z.object({
  category: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(140),
  slug: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(40_000),
  published: z.boolean().default(false),
  order: z.number().int().min(0).max(9999).default(0),
});

export type HelpArticleInput = z.infer<typeof helpArticleSchema>;
