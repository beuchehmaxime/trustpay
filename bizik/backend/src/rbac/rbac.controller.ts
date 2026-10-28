import { Request, Response } from 'express';

import { asyncHandler } from '../lib/errors';
import { RbacService } from './rbac.service';
import {
  createOperatorSchema,
  createRoleSchema,
  updateOperatorSchema,
  updateRoleSchema,
} from './rbac.validation';

export const RbacController = {
  permissions: asyncHandler(async (_req: Request, res: Response) => {
    res.json(RbacService.permissions());
  }),

  // ---- Roles ----
  listRoles: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await RbacService.listRoles());
  }),

  createRole: asyncHandler(async (req: Request, res: Response) => {
    const input = createRoleSchema.parse(req.body);
    res.status(201).json(await RbacService.createRole(input));
  }),

  updateRole: asyncHandler(async (req: Request, res: Response) => {
    const input = updateRoleSchema.parse(req.body);
    res.json(await RbacService.updateRole(req.params.id, input));
  }),

  deleteRole: asyncHandler(async (req: Request, res: Response) => {
    res.json(await RbacService.deleteRole(req.params.id));
  }),

  // ---- Operators ----
  listOperators: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await RbacService.listOperators());
  }),

  createOperator: asyncHandler(async (req: Request, res: Response) => {
    const input = createOperatorSchema.parse(req.body);
    res.status(201).json(await RbacService.createOperator(input));
  }),

  updateOperator: asyncHandler(async (req: Request, res: Response) => {
    const input = updateOperatorSchema.parse(req.body);
    res.json(await RbacService.updateOperator(req.params.id, input));
  }),
};
