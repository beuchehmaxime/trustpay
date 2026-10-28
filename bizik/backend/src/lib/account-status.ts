import { UserStatus } from '@prisma/client';

/**
 * Whether an account may still act on the platform. A PENDING account is a
 * brand-new signup that hasn't finished verifying - it can still use the app.
 * SUSPENDED / FROZEN / CLOSED are operator or AML decisions: the account keeps
 * read access to its own history through support, but must not transact.
 */
export function canAccountAct(status: UserStatus): boolean {
  return status === 'ACTIVE' || status === 'PENDING';
}

/** Plain-language reason an account is blocked, for user-facing channels. */
export function accountBlockedReason(status: UserStatus): string | null {
  switch (status) {
    case 'FROZEN':
      return 'Your BiZik account is frozen while we complete a compliance review. Our team will contact you - you can also reach support from the app.';
    case 'SUSPENDED':
      return 'Your BiZik account is suspended. Please contact BiZik support to restore it.';
    case 'CLOSED':
      return 'This BiZik account is closed. Contact support if you believe this is a mistake.';
    default:
      return null;
  }
}
