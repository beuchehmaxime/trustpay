'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  Lock,
  PowerOff,
  ShieldCheck,
  Snowflake,
  Star,
  Sun,
  Trash2,
  XCircle,
} from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { useDeleteReview, useUser, useUserAction, useUserReviews } from '@/features/users/hooks';
import { StatusBadge } from '@/features/users/status-badge';

const TIER_LABEL = ['Unverified', 'Basic', 'Verified', 'Enhanced'];

/** How each client names itself at signup, in words an operator reads. */
const SIGNUP_SOURCE_LABEL: Record<string, string> = {
  web: 'Web / PWA',
  mobile: 'Mobile app',
  whatsapp: 'WhatsApp',
};

function SignupOrigin({
  signup,
}: {
  signup: { source: string | null; ip: string | null; userAgent: string | null };
}) {
  if (!signup.source && !signup.ip) {
    // Accounts created before this was recorded. Say so rather than showing a
    // dash that could be mistaken for "no client".
    return <span className="text-muted-foreground">Not recorded</span>;
  }
  return (
    <span className="block">
      {signup.source ? (SIGNUP_SOURCE_LABEL[signup.source] ?? signup.source) : 'Unknown client'}
      {signup.ip ? <span className="text-muted-foreground"> from {signup.ip}</span> : null}
      {signup.userAgent ? (
        <span className="mt-0.5 block break-all text-[11px] text-muted-foreground">
          {signup.userAgent}
        </span>
      ) : null}
    </span>
  );
}

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

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canView = usePermission('users.view');
  const canManage = usePermission('users.manage');
  const canSuspend = usePermission('users.suspend');
  const canFreeze = usePermission('accounts.freeze');
  const canModerate = usePermission('reviews.moderate');

  const { data: user, isLoading, isError, error } = useUser(id);
  const actions = useUserAction(id);
  const reviewsQuery = useUserReviews(id, canModerate);
  const deleteReview = useDeleteReview(id);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  async function confirmPendingAction() {
    if (!pendingAction) return;
    try {
      await pendingAction.run();
      toast.success(pendingAction.successMessage);
    } catch (err) {
      toast.error('Action failed', { description: normaliseError(err).message });
    } finally {
      setPendingAction(null);
    }
  }

  if (!canView) {
    return (
      <NoAccess message="You don’t have permission to view this account." />
    );
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !user) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {isError ? normaliseError(error).message : 'User not found.'}
        </div>
      </div>
    );
  }

  const busy =
    actions.suspend.isPending ||
    actions.reactivate.isPending ||
    actions.freeze.isPending ||
    actions.unfreeze.isPending ||
    actions.resetTwoFactor.isPending ||
    actions.forceLogout.isPending;

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header + actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-ink">{user.fullName}</h1>
              <StatusBadge status={user.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {user.email} · <span className="capitalize">{user.role}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canSuspend && user.status === 'SUSPENDED' ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                setPendingAction({
                  title: 'Reactivate account?',
                  description: 'Restore this user’s access to the platform.',
                  confirmLabel: 'Yes, Reactivate',
                  tone: 'default',
                  icon: CheckCircle2,
                  confirmIcon: CheckCircle2,
                  subject: { label: 'User', value: user.fullName },
                  consequencesTitle: 'What happens when you reactivate:',
                  consequences: [
                    'They can sign in again right away',
                    'Their profile, wallets and history are unchanged',
                    'Scheduled work and deals resume as normal',
                  ],
                  successMessage: 'Account reactivated',
                  run: () => actions.reactivate.mutateAsync(),
                })
              }
            >
              <CheckCircle2 className="size-4" /> Reactivate
            </Button>
          ) : null}
          {canSuspend && user.status !== 'SUSPENDED' && user.status !== 'FROZEN' ? (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={busy}
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
                  run: () => actions.suspend.mutateAsync(),
                })
              }
            >
              <Ban className="size-4" /> Suspend
            </Button>
          ) : null}
          {canFreeze && user.status === 'FROZEN' ? (
            <Button
              size="sm"
              disabled={busy}
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
                  run: () => actions.unfreeze.mutateAsync(),
                })
              }
            >
              <Sun className="size-4" /> Unfreeze
            </Button>
          ) : null}
          {canFreeze && user.status !== 'FROZEN' ? (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() =>
                setPendingAction({
                  title: 'Freeze account?',
                  description: 'This places a compliance hold on the account.',
                  confirmLabel: 'Yes, Freeze',
                  tone: 'warning',
                  icon: Snowflake,
                  confirmIcon: Snowflake,
                  subject: { label: 'Account', value: user.fullName },
                  consequencesTitle: 'What happens when you freeze:',
                  consequences: [
                    'They’ll be signed out of all devices immediately',
                    'Wallet balances are locked - no payouts or transfers',
                    'Open deals and escrow are put on hold',
                    'You can unfreeze the account at any time',
                  ],
                  successMessage: 'Account frozen',
                  run: () => actions.freeze.mutateAsync(),
                })
              }
            >
              <Snowflake className="size-4" /> Freeze
            </Button>
          ) : null}
          {canManage && user.twoFactorEnabled ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                setPendingAction({
                  title: 'Reset two-factor authentication?',
                  description: 'This removes their current 2FA device.',
                  confirmLabel: 'Yes, Reset 2FA',
                  tone: 'danger',
                  icon: KeyRound,
                  confirmIcon: KeyRound,
                  subject: { label: 'User', value: user.fullName },
                  consequences: [
                    'Their current authenticator is unlinked',
                    'They’ll be prompted to set up 2FA again on next sign-in',
                    'Until then, their account has no second factor',
                  ],
                  successMessage: '2FA reset',
                  run: () => actions.resetTwoFactor.mutateAsync(),
                })
              }
            >
              <KeyRound className="size-4" /> Reset 2FA
            </Button>
          ) : null}
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                setPendingAction({
                  title: 'Force logout everywhere?',
                  description: 'Ends every active session for this user.',
                  confirmLabel: 'Yes, Force logout',
                  tone: 'danger',
                  icon: LogOut,
                  confirmIcon: LogOut,
                  subject: { label: 'User', value: user.fullName },
                  consequences: [
                    'All active sessions on every device are ended',
                    'They’ll need to sign in again to continue',
                    'Their account status is otherwise unchanged',
                  ],
                  successMessage: 'Signed out everywhere',
                  run: () => actions.forceLogout.mutateAsync(),
                })
              }
            >
              <LogOut className="size-4" /> Force logout
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-0">
            <Row label="Email" value={<Verified ok={user.emailVerified}>{user.email}</Verified>} />
            <Row label="Phone" value={user.phone ? <Verified ok={user.phoneVerified}>{user.phone}</Verified> : '-'} />
            {/* The handle other users send money to. */}
            <Row label="Handle" value={user.username ? `@${user.username}` : '-'} />
            <Row label="Country" value={user.country ?? '-'} />
            <Row label="Company" value={user.companyName ?? '-'} />
            <Row label="Language" value={(user.locale ?? 'en').toUpperCase()} />
            <Row label="Joined" value={new Date(user.createdAt).toLocaleString()} />
            <Row
              label="Last login"
              value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
            />
            {/*
              Where the signup came from. Worth a line of its own: a burst of
              registrations is either a marketing win or a script, and only the
              client, address and agent string tell the two apart.
            */}
            <Row label="Signed up from" value={<SignupOrigin signup={user.signup} />} />
          </CardContent>
        </Card>

        {/* Verification & security */}
        <Card>
          <CardHeader>
            <CardTitle>Verification &amp; security</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-0">
            <Row
              label="KYC tier"
              value={
                <span className="inline-flex items-center gap-2">
                  {TIER_LABEL[user.kycTier] ?? `Tier ${user.kycTier}`}
                  <Badge variant={user.kycTier >= 2 ? 'default' : 'secondary'}>
                    Tier {user.kycTier}
                  </Badge>
                </span>
              }
            />
            <Row label="Freelancer" value={user.freelancerEnabled ? 'Enabled' : 'Not enabled'} />
            <Row label="Email verified" value={<YesNo ok={user.emailVerified} />} />
            <Row label="Phone verified" value={<YesNo ok={user.phoneVerified} />} />
            <Row label="Two-factor (2FA)" value={<YesNo ok={user.twoFactorEnabled} />} />
          </CardContent>
        </Card>

        {/* Profile / reputation */}
        {user.profile ? (
          <Card>
            <CardHeader>
              <CardTitle>Reputation</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-0">
              <Row label="Username" value={`@${user.profile.username}`} />
              <Row
                label="BiZik Score"
                value={<span className="font-bold text-brand-600">{user.profile.bizikScore}</span>}
              />
              <Row label="Completed deals" value={user.profile.completedContracts} />
              <Row
                label="Avg rating"
                value={
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3.5 fill-warning text-warning" />
                    {user.profile.avgRating.toFixed(1)}
                  </span>
                }
              />
              <Row label="Dispute rate" value={`${user.profile.disputeRate}%`} />
              {user.profile.bio ? <Row label="Bio" value={user.profile.bio} /> : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Wallets */}
        <Card>
          <CardHeader>
            <CardTitle>Wallets</CardTitle>
          </CardHeader>
          <CardContent>
            {user.wallets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No wallets provisioned.</p>
            ) : (
              <div className="grid gap-2">
                {user.wallets.map((wallet) => (
                  <div
                    key={wallet.currency}
                    className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2.5"
                  >
                    <div>
                      <span className="text-sm font-semibold text-ink">{wallet.currency}</span>
                      {wallet.pendingBalance > 0 ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {money(wallet.pendingBalance, wallet.currency)} pending
                        </span>
                      ) : null}
                    </div>
                    <span className="text-sm font-bold text-ink">
                      {money(wallet.balance, wallet.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reviews moderation */}
      {canModerate ? (
        <Card>
          <CardHeader>
            <CardTitle>Reviews received</CardTitle>
          </CardHeader>
          <CardContent>
            {reviewsQuery.isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (reviewsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No reviews yet.</p>
            ) : (
              <div className="grid gap-2">
                {reviewsQuery.data!.map((review) => (
                  <div
                    key={review.id}
                    className="flex items-start justify-between gap-4 rounded-lg border border-hairline px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Star className="size-3.5 fill-warning text-warning" />
                        <span className="text-sm font-semibold text-ink">{review.rating}/5</span>
                        {review.reported ? <Badge variant="destructive">Reported</Badge> : null}
                      </div>
                      {review.comment ? (
                        <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={deleteReview.isPending}
                      onClick={() =>
                        setPendingAction({
                          title: 'Remove review?',
                          description: 'This permanently deletes the review.',
                          confirmLabel: 'Yes, Remove',
                          tone: 'danger',
                          icon: Trash2,
                          confirmIcon: Trash2,
                          consequences: ['This cannot be undone'],
                          successMessage: 'Review removed',
                          run: () => deleteReview.mutateAsync(review.id),
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

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

function BackLink() {
  return (
    <Link
      href="/users"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-ink"
    >
      <ArrowLeft className="size-4" /> Back to users
    </Link>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2.5 text-sm last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-ink">{value ?? '-'}</span>
    </div>
  );
}

function YesNo({ ok }: { ok?: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-positive">
      <CheckCircle2 className="size-4" /> Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <XCircle className="size-4" /> No
    </span>
  );
}

function Verified({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      {ok ? <ShieldCheck className="size-3.5 text-positive" /> : null}
    </span>
  );
}

function NoAccess({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <Lock className="size-6" />
      </span>
      <p className="text-sm font-semibold text-ink">No access</p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function initials(name?: string | null) {
  if (!name) return 'U';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
