'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Loader2, Mail, MapPin, Phone, ShieldCheck, UserPen, X } from 'lucide-react';

import { api, normaliseError } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { authApi } from '@/lib/auth/auth.api';
import { useAuthStore } from '@/lib/auth/auth.store';
import { initials } from '@/lib/avatar';
import { cn } from '@/lib/utils';

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const roleLabel = user?.isSuperAdmin ? 'Super Admin' : (user?.adminRole?.name ?? 'Operator');
  const permissionCount = user?.isSuperAdmin ? 'All permissions' : `${user?.permissions?.length ?? 0} permissions`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase">
          <span className="text-muted-foreground">Account</span> <span className="text-ink">Profile</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account details and sign-in security.
        </p>
      </div>

      {/* Identity header */}
      <div className="flex flex-col items-start gap-4 rounded-lg border border-hairline bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:flex-row sm:items-center">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-ink text-xl font-bold text-white">
          {initials(user?.fullName ?? 'Account')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-ink">{user?.fullName ?? 'Account'}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-brand-700 uppercase">
              <ShieldCheck className="size-3" /> {roleLabel}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {permissionCount}
            </span>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-field px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
          >
            <UserPen className="size-4" /> Update profile
          </button>
          <button
            type="button"
            onClick={() => setChangingPassword(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            <KeyRound className="size-4" /> Update password
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-lg border border-hairline bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Account details
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <DetailRow icon={<Mail className="size-4" />} label="Email" value={user?.email} />
          <DetailRow icon={<Phone className="size-4" />} label="Phone" value={user?.phone || '-'} />
          <DetailRow icon={<MapPin className="size-4" />} label="Country" value={user?.country || '-'} />
          <DetailRow icon={<ShieldCheck className="size-4" />} label="Role" value={roleLabel} />
          {user?.companyName ? (
            <DetailRow icon={<UserPen className="size-4" />} label="Company" value={user.companyName} />
          ) : null}
          <DetailRow
            icon={<span className="text-xs font-bold">Aa</span>}
            label="Language"
            value={user?.locale === 'fr' ? 'French' : 'English'}
          />
        </div>
      </div>

      {editing ? <EditProfileModal onClose={() => setEditing(false)} /> : null}
      {changingPassword ? <ChangePasswordModal onClose={() => setChangingPassword(false)} /> : null}
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="truncate text-sm font-medium text-ink">{value || '-'}</p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Edit profile */

function EditProfileModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((state) => state.user);
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [country, setCountry] = useState(user?.country ?? '');
  const [companyName, setCompanyName] = useState(user?.companyName ?? '');

  const save = useMutation({
    mutationFn: async () => {
      await api.patch(endpoints.user.me, {
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        country: country.trim() || undefined,
        companyName: companyName.trim() || undefined,
      });
      const fresh = await authApi.me();
      useAuthStore.setState({ user: fresh });
    },
    onSuccess: () => {
      toast.success('Profile updated');
      onClose();
    },
    onError: (error) => toast.error('Could not update', { description: normaliseError(error).message }),
  });

  const canSave = fullName.trim().length >= 2 && !save.isPending;

  return (
    <ModalShell title="Update profile" onClose={onClose}>
      <div className="space-y-4 p-5">
        <FormField label="Full name">
          <TextInput value={fullName} onChange={setFullName} placeholder="Your name" />
        </FormField>
        <FormField label="Phone">
          <TextInput value={phone} onChange={setPhone} placeholder="+234…" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Country">
            <TextInput value={country} onChange={setCountry} placeholder="Country" />
          </FormField>
          <FormField label="Company (optional)">
            <TextInput value={companyName} onChange={setCompanyName} placeholder="Company" />
          </FormField>
        </div>
      </div>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg border border-field px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => save.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save changes
        </button>
      </ModalFooter>
    </ModalShell>
  );
}

/* ------------------------------------------------------- Change password */

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const change = useMutation({
    mutationFn: () =>
      api.post(endpoints.auth.changePassword, { currentPassword: current, newPassword: next }),
    onSuccess: async () => {
      toast.success('Password changed', { description: 'Please sign in again with your new password.' });
      await logout();
      router.replace('/login');
    },
    onError: (error) => toast.error('Could not change password', { description: normaliseError(error).message }),
  });

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;
  const canSubmit =
    current.length > 0 && next.length >= 8 && next === confirm && !change.isPending;

  return (
    <ModalShell title="Update password" onClose={onClose}>
      <div className="space-y-4 p-5">
        <p className="text-xs text-muted-foreground">
          For your security, changing your password signs you out of all devices.
        </p>
        <FormField label="Current password">
          <TextInput value={current} onChange={setCurrent} type="password" placeholder="••••••••" />
        </FormField>
        <FormField label="New password">
          <TextInput value={next} onChange={setNext} type="password" placeholder="At least 8 characters" />
          {tooShort ? <p className="mt-1 text-xs text-muted-foreground">Use at least 8 characters.</p> : null}
        </FormField>
        <FormField label="Confirm new password">
          <TextInput value={confirm} onChange={setConfirm} type="password" placeholder="Re-enter new password" />
          {mismatch ? <p className="mt-1 text-xs text-destructive">Passwords don’t match.</p> : null}
        </FormField>
      </div>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg border border-field px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => change.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {change.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Update password
        </button>
      </ModalFooter>
    </ModalShell>
  );
}

/* ----------------------------------------------------------- primitives */

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h3 className="font-bold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2 border-t border-hairline p-4">{children}</div>;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn(
        'h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition',
        'placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10',
      )}
    />
  );
}
