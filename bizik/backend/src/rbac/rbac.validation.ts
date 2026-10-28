import { z } from 'zod';

import { isValidPermission } from '../lib/permissions';

const permissionsField = z
  .array(z.string())
  .refine((arr) => arr.every(isValidPermission), { message: 'Unknown permission key' });

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  permissions: permissionsField.default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    permissions: permissionsField.optional(),
  })
  .refine((fields) => Object.keys(fields).length > 0, { message: 'Nothing to update' });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

/** Operator password policy mirrors auth (8+, upper/lower/digit/special). */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[a-z]/, 'Must contain a lowercase letter')
  .regex(/[0-9]/, 'Must contain a digit')
  .regex(/[^A-Za-z0-9]/, 'Must contain a special character');

export const createOperatorSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password,
  roleId: z.string().uuid(),
});
export type CreateOperatorInput = z.infer<typeof createOperatorSchema>;

export const updateOperatorSchema = z
  .object({
    roleId: z.string().uuid().optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  })
  .refine((fields) => Object.keys(fields).length > 0, { message: 'Nothing to update' });
export type UpdateOperatorInput = z.infer<typeof updateOperatorSchema>;
