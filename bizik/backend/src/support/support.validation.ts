import { z } from 'zod';

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Give your request a short subject.').max(140),
  body: z.string().trim().min(5, 'Describe how we can help.').max(4000),
  category: z.enum(['PAYMENTS', 'KYC', 'DISPUTES', 'ACCOUNT', 'TECHNICAL', 'OTHER']).default('OTHER'),
});

export const replySchema = z.object({
  body: z.string().trim().min(1, 'Write a message.').max(4000),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
