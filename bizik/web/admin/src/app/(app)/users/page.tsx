'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ChevronDown,
  Download,
  Eye,
  Loader2,
  Lock,
  PowerOff,
  Search,
  Sun,
  TrendingUp,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { useUserRowActions, useUsers, useUsersStats } from '@/features/users/hooks';
import { StatusBadge } from '@/features/users/status-badge';
import type { UserListItem } from '@/features/users/users.api';

const TIER_LABEL = ['Unverified', 'Basic', 'Verified', 'Enhanced'];

interface PendingAction {
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  run: () => Promise<unknown>;
  tone?: 'default' | 'danger' | 'warning';
  icon?: ComponentType<{ className?: string }>;
  confirmIcon?: ComponentType<{ className?: string }>;
  subject?: { label: string; value: string };
  consequencesTitle?: string;
  consequences?: string[];
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatJoined(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function UsersPage() {
  const canView = usePermission('users.view');
  const canSuspend = usePermission('users.suspend');
  const canFreeze = usePermission('accounts.freeze');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [kycTier, setKycTier] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const { data, isLoading, isError, error, isFetching } = useUsers({
    search: search || undefined,
    status: status || undefined,
    role: role || undefined,
    kycTier: kycTier ? Number(kycTier) : undefined,
    page,
    pageSize,
  });
  const { data: stats } = useUsersStats();
  const rowActions = useUserRowActions();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-ink">No access</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          You don’t have permission to view users.
        </p>
      </div>
    );
  }

  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasNextPage = page * pageSize < total;

  function exportCsv() {
    const headers = ['Name', 'Phone', 'Username', 'Role', 'KYC tier', 'Status', 'Joined'];
    const lines = users.map((user) =>
      [
        user.fullName,
        user.phone ?? '',
        user.username ?? '',
        user.role,
        user.kycTier,
        user.status,
        user.createdAt,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bizik-users.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    try {
      await pendingAction.run();
      toast.success(pendingAction.successMessage);
    } catch (actionError) {
      toast.error('Action failed', { description: normaliseError(actionError).message });
    } finally {
      setPendingAction(null);
    }
  }

  function contextualAction(user: UserListItem) {
    if (canSuspend && user.status === 'ACTIVE') {
      return (
        <button
          type="button"
          className="font-medium text-negative hover:opacity-80"
          onClick={() =>
            setPendingAction({
              title: 'Suspend account?',
              description: 'This will immediately revoke access.',
              confirmLabel: 'Yes, Suspend',
              tone: 'warning',
              icon: PowerOff,
              confirmIcon: PowerOff,
              subject: { label: 'User', value: user.fullName },
              consequencesTitle: 'What happens when you suspend:',
              consequences: [
                'They’ll be signed out of all devices immediately',
                'Active sessions and API access are revoked',
                'Their profile, wallets and history are preserved',
                'You can reactivate the account at any time',
              ],
              successMessage: 'Account suspended',
              run: () => rowActions.suspend.mutateAsync(user.id),
            })
          }
        >
          Suspend
        </button>
      );
    }
    if (canSuspend && user.status === 'SUSPENDED') {
      return (
        <button
          type="button"
          className="font-medium text-positive hover:opacity-80"
          onClick={() =>
            setPendingAction({
              title: 'Reactivate account?',
              description: 'Restore this user’s access to the platform.',
              confirmLabel: 'Yes, Reactivate',
              tone: 'default',
              icon: Sun,
              confirmIcon: Sun,
              subject: { label: 'User', value: user.fullName },
              successMessage: 'Account reactivated',
              run: () => rowActions.reactivate.mutateAsync(user.id),
            })
          }
        >
          Reactivate
        </button>
      );
    }
    if (canFreeze && user.status === 'FROZEN') {
      return (
        <button
          type="button"
          className="font-medium text-positive hover:opacity-80"
          onClick={() =>
            setPendingAction({
              title: 'Unfreeze account?',
              description: 'Lift the compliance hold on this account.',
              confirmLabel: 'Yes, Unfreeze',
              tone: 'default',
              icon: Sun,
              confirmIcon: Sun,
              subject: { label: 'Account', value: user.fullName },
              consequencesTitle: 'What happens when you unfreeze:',
              consequences: [
                'Wallet balances and payouts are unlocked',
                'Open deals and escrow resume',
                'The user regains full account access',
              ],
              successMessage: 'Account unfrozen',
              run: () => rowActions.unfreeze.mutateAsync(user.id),
            })
          }
        >
          Unfreeze
        </button>
      );
    }
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider uppercase">
            <span className="text-muted-foreground">People</span>{' '}
            <span className="text-ink">Users &amp; accounts</span>
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Users &amp; accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clients, freelancers and agencies across all markets.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={users.length === 0}>
          <Download className="size-4" /> Export CSV
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={stats?.total} />
        <StatCard label="Active" value={stats?.active} note="ok" tone="positive" />
        <StatCard label="Pending" value={stats?.pending} note="awaiting" tone="muted" />
        <StatCard
          label="Suspended / frozen"
          value={stats ? stats.suspended + stats.frozen : undefined}
          note="needs review"
          tone="warning"
        />
      </div>

      {/* Combined filters + table */}
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-col gap-2.5 border-b border-hairline px-6 py-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search name, phone or username…"
              className="h-10 w-full rounded-lg border border-field bg-white pr-3 pl-10 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
          <FilterSelect
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="FROZEN">Frozen</option>
            <option value="CLOSED">Closed</option>
          </FilterSelect>
          <FilterSelect
            value={role}
            onChange={(value) => {
              setRole(value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            <option value="CLIENT">Client</option>
            <option value="FREELANCER">Freelancer</option>
            <option value="AGENCY">Agency</option>
          </FilterSelect>
          <FilterSelect
            value={kycTier}
            onChange={(value) => {
              setKycTier(value);
              setPage(1);
            }}
          >
            <option value="">All KYC tiers</option>
            <option value="0">Unverified</option>
            <option value="1">Basic</option>
            <option value="2">Verified</option>
            <option value="3">Enhanced</option>
          </FilterSelect>
        </div>

        {isError ? (
          <div className="p-6 text-sm text-destructive">{normaliseError(error).message}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <HeaderCell>User</HeaderCell>
                <HeaderCell>Username</HeaderCell>
                <HeaderCell>Role</HeaderCell>
                <HeaderCell>KYC</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Joined</HeaderCell>
                <HeaderCell className="text-right">Actions</HeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className="hover:bg-muted/40">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                          avatarColor(user.fullName),
                        )}
                      >
                        {initials(user.fullName)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-ink">{user.fullName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {user.phone ?? '-'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-ink">
                    {user.username ? `@${user.username}` : '-'}
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'font-medium',
                        user.kycTier >= 2 ? 'text-positive' : 'text-muted-foreground',
                      )}
                    >
                      {user.kycTier} · {TIER_LABEL[user.kycTier] ?? `Tier ${user.kycTier}`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatJoined(user.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-4">
                      <Link
                        href={`/users/${user.id}`}
                        className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700"
                      >
                        <Eye className="size-3.5" /> View
                      </Link>
                      {contextualAction(user)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {isLoading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-12 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : null}
              {!isLoading && users.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    No users match your filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}

        {/* Footer / pagination */}
        <div className="flex items-center justify-between border-t border-hairline px-6 py-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            {total} user{total === 1 ? '' : 's'}
            {isFetching ? <Loader2 className="size-3.5 animate-spin" /> : null}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(next) => {
          if (!next) setPendingAction(null);
        }}
        title={pendingAction?.title ?? ''}
        description={pendingAction?.description}
        confirmLabel={pendingAction?.confirmLabel}
        tone={pendingAction?.tone}
        icon={pendingAction?.icon}
        confirmIcon={pendingAction?.confirmIcon}
        subject={pendingAction?.subject}
        consequencesTitle={pendingAction?.consequencesTitle}
        consequences={pendingAction?.consequences}
        onConfirm={confirmPendingAction}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  tone = 'muted',
}: {
  label: string;
  value?: number;
  note?: string;
  tone?: 'positive' | 'warning' | 'muted';
}) {
  const toneClass =
    tone === 'positive' ? 'text-positive' : tone === 'warning' ? 'text-warning' : 'text-muted-foreground';
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink">{value ?? '-'}</p>
      {note ? (
        <p className={cn('mt-1 inline-flex items-center gap-1 text-xs font-medium', toneClass)}>
          <TrendingUp className="size-3.5" /> {note}
        </p>
      ) : null}
    </div>
  );
}

function HeaderCell({ children, className }: { children: ReactNode; className?: string }) {
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

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-hairline bg-white px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {role}
    </span>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-lg border border-field bg-white pr-9 pl-3.5 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 lg:w-40"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
