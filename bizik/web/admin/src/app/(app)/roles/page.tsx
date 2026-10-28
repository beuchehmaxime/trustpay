'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, KeyRound, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import {
  useCreateRole,
  useDeleteRole,
  usePermissionCatalog,
  useRoles,
  useUpdateRole,
} from '@/features/rbac/hooks';
import type { PermissionDef, Role } from '@/features/rbac/rbac.api';

interface Draft {
  id?: string;
  name: string;
  description: string;
  permissions: string[];
}

export default function RolesPage() {
  const canManage = usePermission('roles.manage');
  const { data: roles, isLoading } = useRoles();
  const { data: catalog } = usePermissionCatalog();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const [draft, setDraft] = useState<Draft | null>(null);
  const saving = createRole.isPending || updateRole.isPending;

  const groups = useMemo(() => {
    const byGroup: Record<string, PermissionDef[]> = {};
    (catalog ?? []).forEach((permission) => {
      (byGroup[permission.group] ??= []).push(permission);
    });
    return byGroup;
  }, [catalog]);

  function toggle(permissionKey: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            permissions: current.permissions.includes(permissionKey)
              ? current.permissions.filter((existing) => existing !== permissionKey)
              : [...current.permissions, permissionKey],
          }
        : current,
    );
  }

  async function save() {
    if (!draft) return;
    if (draft.name.trim().length < 2) return toast.error('Enter a role name.');
    try {
      if (draft.id) {
        await updateRole.mutateAsync({
          id: draft.id,
          input: {
            name: draft.name.trim(),
            description: draft.description.trim(),
            permissions: draft.permissions,
          },
        });
      } else {
        await createRole.mutateAsync({
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          permissions: draft.permissions,
        });
      }
      toast.success(draft.id ? 'Role updated' : 'Role created');
      setDraft(null);
    } catch (err) {
      toast.error('Could not save role', { description: normaliseError(err).message });
    }
  }

  async function onDelete(role: Role) {
    if (!window.confirm(`Delete the "${role.name}" role? This cannot be undone.`)) return;
    try {
      await deleteRole.mutateAsync(role.id);
      toast.success('Role deleted');
    } catch (err) {
      toast.error('Could not delete role', { description: normaliseError(err).message });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roles &amp; permissions</h1>
          <p className="text-sm text-muted-foreground">
            Define what each platform operator can see and do.
          </p>
        </div>
        {canManage && !draft ? (
          <Button onClick={() => setDraft({ name: '', description: '', permissions: [] })}>
            <Plus className="size-4" /> New role
          </Button>
        ) : null}
      </div>

      <Dialog open={!!draft} onOpenChange={(open) => (!open ? setDraft(null) : undefined)}>
        <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Edit role' : 'New role'}</DialogTitle>
            <DialogDescription>
              Name the role and choose exactly what it can do.
            </DialogDescription>
          </DialogHeader>

          {draft ? (
            <div className="space-y-6 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Role name"
                  placeholder="e.g. Compliance Officer"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  autoFocus
                />
                <Field
                  label="Description"
                  placeholder="Optional"
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </div>

              <div className="space-y-4">
                <p className="text-sm font-semibold text-ink">Permissions</p>
                {Object.entries(groups).map(([group, perms]) => (
                  <div key={group}>
                    <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {group}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {perms.map((permission) => {
                        const isOn = draft.permissions.includes(permission.key);
                        return (
                          <button
                            type="button"
                            key={permission.key}
                            onClick={() => toggle(permission.key)}
                            className={cn(
                              'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition',
                              isOn
                                ? 'border-brand-400 bg-brand-50'
                                : 'border-hairline hover:border-field',
                            )}
                          >
                            <span
                              className={cn(
                                'flex size-5 shrink-0 items-center justify-center rounded-md border',
                                isOn ? 'border-brand-500 bg-brand-500 text-white' : 'border-field',
                              )}
                            >
                              {isOn ? <Check className="size-3.5" strokeWidth={3} /> : null}
                            </span>
                            <span className="text-sm text-ink">{permission.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4">
        {(roles ?? []).map((role) => (
          <Card key={role.id}>
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    {role.isSuperAdmin ? (
                      <ShieldCheck className="size-4" />
                    ) : (
                      <KeyRound className="size-4" />
                    )}
                  </span>
                  <div>
                    <p className="font-semibold text-ink">
                      {role.name}
                      {role.isSystem ? (
                        <Badge variant="secondary" className="ml-2 align-middle">
                          System
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {role.description || (role.isSuperAdmin ? 'Full, unrestricted access' : '-')}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {role.isSuperAdmin ? (
                    <Badge>All permissions</Badge>
                  ) : role.permissions.length ? (
                    role.permissions.map((permissionKey) => (
                      <Badge key={permissionKey} variant="secondary" className="font-normal">
                        {permissionKey}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No permissions</span>
                  )}
                </div>
                {typeof role.operatorCount === 'number' ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {role.operatorCount} operator{role.operatorCount === 1 ? '' : 's'}
                  </p>
                ) : null}
              </div>

              {canManage && !role.isSuperAdmin ? (
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        id: role.id,
                        name: role.name,
                        description: role.description ?? '',
                        permissions: role.permissions,
                      })
                    }
                  >
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  {!role.isSystem ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDelete(role)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {isLoading ? <p className="text-sm text-muted-foreground">Loading roles…</p> : null}
      </div>
    </div>
  );
}
