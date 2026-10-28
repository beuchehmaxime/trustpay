import { z } from 'zod';

/**
 * What a campaign may carry, in the shape every rail could accept.
 *
 * It used to be template-only, because Meta refuses business-initiated free
 * text. WasenderAPI has no templates at all, so a body is now allowed too and
 * both are stored - which of them is REQUIRED is a question about the live
 * rail, answered in campaign-sender.ts rather than here.
 *
 * Meta's own limits still apply to the template path: a variable longer than
 * 1024 characters, or one containing a newline, is rejected by the Cloud API,
 * and finding that out one recipient at a time is the worst way to learn it.
 */
const templateVariable = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => !/[\n\r\t]/.test(value), {
    message: 'Template variables cannot contain line breaks or tabs.',
  });

export const sendCampaignSchema = z.object({
  /** Operator-facing name. Internal, so it only has to be recognisable later. */
  name: z.string().min(3).max(120),
  segment: z.string().min(1).max(60),
  /**
   * Meta template names are lowercase letters, digits and underscores. Checking
   * the shape here turns a per-recipient 132001 ("template does not exist") into
   * one clear error before anything is sent.
   */
  template: z
    .string()
    .max(512)
    .regex(/^[a-z0-9_]*$/, 'A template name is lowercase letters, numbers and underscores only.')
    .optional()
    .default(''),
  /**
   * The message itself, for a rail that sends prose rather than naming a
   * template Meta has approved. Which of `template` and `body` is REQUIRED
   * depends on the live rail, so that check belongs with the rail
   * (missingForProvider) rather than here - otherwise this schema would have to
   * know about configuration, and would reject a perfectly good campaign every
   * time the rail changed.
   */
  body: z.string().max(4000).optional(),
  language: z.string().min(2).max(10).optional(),
  variables: z.array(templateVariable).max(10).optional(),
  note: z.string().max(1000).optional(),
});

export type SendCampaignInput = z.infer<typeof sendCampaignSchema>;
