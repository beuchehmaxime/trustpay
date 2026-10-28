import { z } from 'zod';

/**
 * A delivery date (YYYY-MM-DD) is REQUIRED on every milestone - it is what we
 * use to remind both parties the day before a deliverable is due, so it can no
 * longer be left blank.
 */
/** Today's date as YYYY-MM-DD (server clock) - the earliest allowed delivery. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const deliveryDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a delivery date for this deal.')
  // A delivery date can't be in the past - it drives due-date reminders.
  .refine((value) => value >= todayIso(), 'The delivery date cannot be in the past.');

/** A phone number (E.164-ish; normalised in the service). */
const counterpartyPhone = z
  .string()
  .min(6)
  .max(24)
  .refine((value) => /^\+?[\d\s\-().]{6,}$/.test(value), 'Enter a valid phone number');

/**
 * Create a deal. You invite a counterparty by name + PHONE (the person's BiZik
 * identity) and choose, per deal, whether you pay or get paid.
 */
export const createProjectSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  currency: z.enum(['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'XAF']),
  /**
   * The name the creator knows the counterparty by - OPTIONAL. It's the
   * creator's private alias for this deal, not the counterparty's account name.
   * If omitted, we default to the counterparty's own master name once they join.
   */
  counterpartyName: z.string().min(2).max(120).optional(),
  /** The counterparty's phone number - required (it's how we find/invite them). */
  counterpartyPhone,
  /** true = you fund the escrow (you pay); false = the counterparty pays. */
  creatorIsPayer: z.boolean(),
  inspectionDays: z.number().int().min(3).max(14).optional(),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        description: z.string().max(1000).optional(),
        amount: z.number().positive(),
        dueDate: deliveryDate,
      }),
    )
    .min(1)
    .max(20),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Fix the counterparty's details on a deal that hasn't been confirmed yet.
 */
export const editCounterpartySchema = z.object({
  counterpartyName: z.string().min(2).max(120).optional(),
  counterpartyPhone: counterpartyPhone.optional(),
});
export type EditCounterpartyInput = z.infer<typeof editCounterpartySchema>;

/** Payee submits a deliverable for a milestone. */
export const submitWorkSchema = z.object({
  note: z.string().max(2000).optional(),
  fileIds: z.array(z.string()).max(10).optional(),
  /** Base64 / data-URL images uploaded with the delivery (stored to Cloudinary). */
  images: z.array(z.string()).max(10).optional(),
});
export type SubmitWorkInput = z.infer<typeof submitWorkSchema>;

/** Payer requests a revision (written feedback required - FR-PAY-006). */
export const revisionSchema = z.object({
  feedback: z.string().trim().min(3).max(2000),
});
export type RevisionInput = z.infer<typeof revisionSchema>;

/** Add a milestone to an existing project. */
export const addMilestoneSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  amount: z.number().positive(),
  dueDate: deliveryDate,
});
export type AddMilestoneInput = z.infer<typeof addMilestoneSchema>;

/** Edit an unfunded milestone (any subset of fields; a delivery date stays required). */
export const editMilestoneSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(1000).optional(),
    amount: z.number().positive().optional(),
    dueDate: deliveryDate.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export type EditMilestoneInput = z.infer<typeof editMilestoneSchema>;
