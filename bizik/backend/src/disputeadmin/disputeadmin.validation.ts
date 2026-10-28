import { z } from 'zod';

export const assignSchema = z.object({
  mediatorId: z.string().uuid('Choose a mediator'),
});

export const escalateSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

/** Binding ruling - split needs a freelancer percentage. */
export const ruleSchema = z
  .object({
    ruling: z.enum(['FULL_RELEASE', 'FULL_REFUND', 'PARTIAL_SPLIT']),
    freelancerPct: z.number().int().min(0).max(100).optional(),
    rationale: z.string().trim().min(3, 'Give a rationale for the ruling').max(1000),
  })
  .refine(
    (value) => value.ruling !== 'PARTIAL_SPLIT' || typeof value.freelancerPct === 'number',
    { message: 'A split needs a freelancer percentage', path: ['freelancerPct'] },
  );
