'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import {
  useCreateOperator,
  useOperators,
  useRoles,
  useUpdateOperator,
} from '@/features/rbac/hooks';
import type { Operator } from '@/features/rbac/rbac.api';

const SELECT_CLASS =
  'h-11 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10';

const EMPTY = { fullName: '', email: '', password: '', roleId: '' };

export default function OperatorsPage() {
  const canManage = usePermission('operators.manage');
  const { data: operators, isLoading } = useOperators();
  const { data: roles } = useRoles();
  const createOperator = useCreateOperator();
  const updateOperator = useUpdateOperator();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  // Roles that can be assigned (super admin is granted, not hand-assigned here).
  const assignable = (roles ?? []).filter((role) => !role.isSuperAdmin);

  async function create() {
    if (
      form.fullName.trim().length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ||
      form.password.length < 8 ||
      !form.roleId
    ) {
      toast.error('Fill in every field (password 8+ chars).');
      return;
    }
    try {
      await createOperator.mutateAsync({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        roleId: form.roleId,
      });
      toast.success('Operator created', {
        description: 'They can sign in with this password plus an emailed code.',
      });
      setForm(EMPTY);
      setOpen(false);
    } catch (err) {
      toast.error('Could not create operator', { description: normaliseError(err).message });
    }
  }

  async function changeRole(operator: Operator, roleId: string) {
    if (!roleId || roleId === operator.role?.id) return;
    try {
      await updateOperator.mutateAsync({ id: operator.id, input: { roleId } });
      toast.success('Role updated');
    } catch (err) {
      toast.error('Could not update role', { description: normaliseError(err).message });
    }
  }

  async function toggleStatus(operator: Operator) {
    const nextStatus = operator.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    try {
      await updateOperator.mutateAsync({ id: operator.id, input: { status: nextStatus } });
      toast.success(nextStatus === 'ACTIVE' ? 'Operator activated' : 'Operator suspended');
    } catch (err) {
      toast.error('Could not update', { description: normaliseError(err).message });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform operators</h1>
          <p className="text-sm text-muted-foreground">
            Staff accounts with admin-console access, each governed by a role.
          </p>
        </div>
        {canManage && !open ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add operator
          </Button>
        ) : null}
      </div>

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle>New operator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Full name"
                placeholder="Jane Doe"
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
              />
              <Field
                label="Email"
                type="email"
                placeholder="jane@bizik.cm"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
              <Field
                label="Temporary password"
                type="password"
                placeholder="8+ chars, mixed case, number & symbol"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
              <div className="grid gap-1.5">
                <label className="text-[13px] font-semibold text-ink">Role</label>
                <select
                  className={SELECT_CLASS}
                  value={form.roleId}
                  onChange={(event) => setForm({ ...form, roleId: event.target.value })}
                >
                  <option value="">Select a role…</option>
                  {assignable.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={create} disabled={createOperator.isPending}>
                {createOperator.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  'Create operator'
                )}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operator</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(operators ?? []).map((operator) => (
                <TableRow key={operator.id}>
                  <TableCell>
                    <div className="font-medium text-ink">{operator.fullName}</div>
                    <div className="text-xs text-muted-foreground">{operator.email}</div>
                  </TableCell>
                  <TableCell>
                    {canManage && !operator.role?.isSuperAdmin ? (
                      <select
                        className={cn(SELECT_CLASS, 'h-9 w-44')}
                        value={operator.role?.id ?? ''}
                        onChange={(event) => changeRole(operator, event.target.value)}
                      >
                        {assignable.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge variant={operator.role?.isSuperAdmin ? 'default' : 'secondary'}>
                        {operator.role?.name ?? '-'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={operator.status === 'ACTIVE' ? 'secondary' : 'destructive'}>
                      {operator.status}
                    </Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      {!operator.role?.isSuperAdmin ? (
                        <Button size="sm" variant="outline" onClick={() => toggleStatus(operator)}>
                          {operator.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {!isLoading && (operators ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 4 : 3} className="py-8 text-center text-sm text-muted-foreground">
                    No operators yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
