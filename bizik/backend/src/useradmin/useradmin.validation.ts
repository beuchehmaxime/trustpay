import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: z.enum(['CLIENT', 'FREELANCER', 'AGENCY']).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'FROZEN', 'CLOSED']).optional(),
  kycTier: z.coerce.number().int().min(0).max(3).optional(),
  country: z.string().trim().max(60).optional(),
  sortBy: z.enum(['createdAt', 'fullName', 'lastLoginAt', 'kycTier', 'status']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** Optional reason recorded with a status change. */
export const reasonSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});
