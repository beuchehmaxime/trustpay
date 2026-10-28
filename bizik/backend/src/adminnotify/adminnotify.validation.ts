import { z } from 'zod';

const CHANNEL = z.enum(['IN_APP', 'EMAIL', 'PUSH', 'SMS']);

/** Broadcast an announcement to a segment of end users across channels. */
export const broadcastSchema = z.object({
  title: z.string().trim().min(3, 'Give the broadcast a title.').max(120),
  body: z.string().trim().min(5, 'Write a message.').max(1000),
  audience: z.enum(['ALL', 'FREELANCERS', 'CLIENTS']),
  category: z.enum(['SYSTEM', 'PAYMENT', 'CONTRACT', 'SECURITY']).default('SYSTEM'),
  channels: z.array(CHANNEL).min(1, 'Choose at least one channel.').default(['IN_APP', 'EMAIL']),
});

export type BroadcastInput = z.infer<typeof broadcastSchema>;

/** Save a notification template's editable copy + delivery channels. */
export const updateTemplateSchema = z.object({
  subject: z.string().trim().min(1, 'A subject is required.').max(200),
  body: z.string().trim().min(1, 'A body is required.').max(4000),
  channels: z.array(CHANNEL).min(1, 'Choose at least one channel.'),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
