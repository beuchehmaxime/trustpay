import { z } from 'zod';

/** Optional reviewer note on clear/escalate. */
export const noteSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

/** Narrative is required when filing a Suspicious Activity Report. */
export const sarSchema = z.object({
  narrative: z.string().trim().min(10, 'Provide a narrative of at least 10 characters'),
});

/** An investigation note added to the case file. */
export const noteBodySchema = z.object({
  note: z.string().trim().min(1, 'Note cannot be empty').max(2000),
});
