import { z } from 'zod';

/**
 * Update the signed-in user's own profile. Phone is the login identity but can
 * be changed here (e.g. a new number); email is optional (added for KYC /
 * contact). All fields optional - the client sends only what changed.
 */
export const updateProfileSchema = z
  .object({
    fullName: z.string().min(2).max(120).optional(),
    // Change the account's identity phone (E.164-ish; normalised in the service).
    phone: z
      .string()
      .min(6)
      .max(24)
      .refine((value) => /^\+?[\d\s\-().]{6,}$/.test(value), 'Enter a valid phone number')
      .optional(),
    // Add or change the account's optional email. '' clears it.
    email: z.union([z.string().email(), z.literal('')]).optional(),
    country: z.string().min(2).max(60).optional(),
    companyName: z.string().max(120).optional(),
    locale: z.enum(['en', 'fr']).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Look up whether someone is already on BiZik, by email or phone. */
export const lookupSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(4).max(20).optional(),
  })
  .refine((d) => !!d.email || !!d.phone, { message: 'Provide an email or phone' });
export type LookupInput = z.infer<typeof lookupSchema>;
