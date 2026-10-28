'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, FileStack, Loader2, Lock, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useContractTemplates, useDeleteTemplate } from '@/features/projects/hooks';
import type { ContractTemplate } from '@/features/projects/types';

export default function ContractTemplatesPage() {
  const canManage = usePermission('templates.manage');
  const { data, isLoading, isError, error } = useContractTemplates(canManage);
  const deleteTemplate = useDeleteTemplate();
  const [pending, setPending] = useState<ContractTemplate | null>(null);
  const templates = data ?? [];

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You don’t have permission to manage contract templates.
        </p>
      </div>
    );
  }

  async function confirmDelete() {
    if (!pending) return;
    try {
      await deleteTemplate.mutateAsync(pending.id);
      toast.success('Template deleted');
    } catch (deleteError) {
      toast.error('Could not delete', { description: normaliseError(deleteError).message });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/contracts"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
      >
        <ArrowLeft className="size-4" /> Deals
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Contract templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reusable milestone structures. System templates are built-in and cannot be removed.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {isError ? (
          <div className="p-6 text-sm text-destructive">{normaliseError(error).message}</div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <FileStack className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Category</HeaderCell>
                <HeaderCell>Milestones</HeaderCell>
                <HeaderCell>Kind</HeaderCell>
                <HeaderCell className="text-right">Actions</HeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id} className="hover:bg-muted/40">
                  <TableCell className="py-4 font-medium text-ink">{template.name}</TableCell>
                  <TableCell className="text-ink">{template.category}</TableCell>
                  <TableCell className="text-muted-foreground">{template.milestones}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
                        template.isSystem
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-700',
                      )}
                    >
                      {template.isSystem ? 'System' : 'Custom'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {template.isSystem ? (
                      <span className="text-xs text-muted-foreground">Built-in</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPending(template)}
                        className="inline-flex items-center gap-1 font-medium text-negative hover:opacity-80"
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title="Delete template?"
        description="This permanently removes the template and its milestones."
        confirmLabel="Yes, Delete"
        tone="danger"
        icon={Trash2}
        confirmIcon={Trash2}
        subject={pending ? { label: 'Template', value: pending.name } : undefined}
        consequences={['This cannot be undone', 'Existing contracts are unaffected']}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function HeaderCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(
        'text-[11px] font-semibold tracking-wider text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </TableHead>
  );
}
