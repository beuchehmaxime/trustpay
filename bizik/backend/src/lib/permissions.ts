/**
 * RBAC permission catalog for the platform/admin section.
 *
 * Permissions are code-defined keys (not user-editable). A dynamic {@link
 * AdminRole} holds a subset of these keys; the super-admin role grants them all.
 * Every protected admin action maps to exactly one key - see
 * `middleware.requirePermission` and the admin/rbac routes.
 */
export interface PermissionDef {
  key: string;
  group: string;
  label: string;
  description?: string;
}

export const PERMISSIONS: PermissionDef[] = [
  // General
  { key: 'dashboard.view', group: 'General', label: 'View the dashboard' },

  // People
  { key: 'users.view', group: 'People', label: 'View users & accounts' },
  { key: 'users.manage', group: 'People', label: 'Edit accounts (reset 2FA, force logout, …)' },
  { key: 'users.suspend', group: 'People', label: 'Suspend, ban or reactivate accounts' },
  { key: 'reviews.moderate', group: 'People', label: 'Moderate reviews & badges' },

  // Trust & safety
  { key: 'kyc.view', group: 'Trust & safety', label: 'View the KYC queue & submissions' },
  { key: 'kyc.approve', group: 'Trust & safety', label: 'Approve KYC submissions' },
  { key: 'kyc.reject', group: 'Trust & safety', label: 'Reject KYC submissions' },
  { key: 'kyc.request_docs', group: 'Trust & safety', label: 'Request additional documents' },
  { key: 'kyc.escalate', group: 'Trust & safety', label: 'Escalate to compliance' },
  { key: 'aml.view', group: 'Trust & safety', label: 'View AML / sanctions alerts' },
  { key: 'aml.resolve', group: 'Trust & safety', label: 'Resolve AML cases & file SARs' },
  { key: 'accounts.freeze', group: 'Trust & safety', label: 'Freeze / unfreeze accounts' },
  // Separate from every other account permission, and from settings.manage,
  // because it is the only one that destroys data. Holding it should be a
  // deliberate grant to a named person, not something inherited by being able
  // to edit settings.
  { key: 'accounts.purge', group: 'Trust & safety', label: 'Delete dormant accounts (destructive)' },
  { key: 'disputes.view', group: 'Trust & safety', label: 'View disputes' },
  { key: 'disputes.assign', group: 'Trust & safety', label: 'Assign disputes to mediators' },
  { key: 'disputes.resolve', group: 'Trust & safety', label: 'Rule on disputes (release/refund/split)' },
  { key: 'audit.view', group: 'Trust & safety', label: 'View the audit log' },

  // Commerce
  { key: 'contracts.view', group: 'Commerce', label: 'View projects & contracts' },
  { key: 'contracts.manage', group: 'Commerce', label: 'Force-cancel / complete contracts' },
  { key: 'templates.manage', group: 'Commerce', label: 'Manage contract templates' },
  { key: 'escrow.view', group: 'Commerce', label: 'View escrow accounts & transactions' },
  { key: 'escrow.manage', group: 'Commerce', label: 'Manual release / refund / adjustment' },
  { key: 'payments.view', group: 'Commerce', label: 'View payment gateway activity' },
  { key: 'wallets.view', group: 'Commerce', label: 'View wallets & payouts' },
  { key: 'payouts.view', group: 'Commerce', label: 'View the payout queue' },
  { key: 'payouts.manage', group: 'Commerce', label: 'Approve / hold / retry payouts' },
  { key: 'fees.view', group: 'Commerce', label: 'View fees & FX config' },
  { key: 'fees.manage', group: 'Commerce', label: 'Edit fees & pricing' },
  { key: 'fx.manage', group: 'Commerce', label: 'Manage FX rates & margins' },

  // Communications & insights
  { key: 'notifications.manage', group: 'Communications', label: 'Manage notification templates' },
  { key: 'broadcasts.send', group: 'Communications', label: 'Send broadcasts & announcements' },
  { key: 'messages.moderate', group: 'Communications', label: 'Moderate in-contract messages' },
  // Reading what was sent and deciding to send are separate grants, the same
  // way KYC review and AML resolution are: a support lead should be able to see
  // that a campaign went out without being able to start one.
  { key: 'outreach.view', group: 'Communications', label: 'View WhatsApp outreach campaigns' },
  { key: 'outreach.send', group: 'Communications', label: 'Send WhatsApp outreach campaigns' },
  { key: 'reports.view', group: 'Communications', label: 'View reports & analytics' },
  // Business analytics is split three ways because the sensitivity is not
  // uniform. Someone working on growth needs the funnel and cannot be given the
  // P&L to get it; someone reviewing the P&L has no reason to be able to change
  // what the month cost. One permission covering all of it would force every
  // analytics user to be trusted with the most sensitive thing in it.
  {
    key: 'analytics.product',
    group: 'Communications',
    label: 'View product analytics (funnel, visits, retention)',
  },
  {
    key: 'analytics.financial',
    group: 'Communications',
    label: 'View financial analytics (revenue, EBITDA, margin)',
  },
  {
    key: 'analytics.costs',
    group: 'Communications',
    label: 'Enter and edit operating costs',
  },
  { key: 'reports.export', group: 'Communications', label: 'Export regulatory reports' },

  // Access & platform
  { key: 'roles.view', group: 'Access & platform', label: 'View roles & permissions' },
  { key: 'roles.manage', group: 'Access & platform', label: 'Create, edit & delete roles' },
  { key: 'operators.view', group: 'Access & platform', label: 'View platform operators' },
  { key: 'operators.manage', group: 'Access & platform', label: 'Create & manage operators' },
  { key: 'settings.view', group: 'Access & platform', label: 'View platform settings' },
  { key: 'settings.manage', group: 'Access & platform', label: 'Edit platform settings' },
  { key: 'whatsapp.view', group: 'Access & platform', label: 'View WhatsApp channel activity' },
  { key: 'whatsapp.manage', group: 'Access & platform', label: 'Pause or resume the WhatsApp channel' },
  { key: 'support.view', group: 'Access & platform', label: 'View support tickets' },
  { key: 'support.manage', group: 'Access & platform', label: 'Respond to support tickets' },
];

export const PERMISSION_KEYS: string[] = PERMISSIONS.map((permission) => permission.key);

export function isValidPermission(key: string): boolean {
  return PERMISSION_KEYS.includes(key);
}

/** Whether a role grants a permission. Super-admin roles grant everything. */
export function roleCan(
  role: { isSuperAdmin: boolean; permissions: string[] } | null | undefined,
  perm: string,
): boolean {
  if (!role) return false;
  return role.isSuperAdmin || role.permissions.includes(perm);
}
