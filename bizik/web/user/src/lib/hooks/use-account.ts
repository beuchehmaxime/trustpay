import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authApi } from '@/lib/auth/auth.api';
import { useAuthStore } from '@/lib/auth/auth.store';

/** Active refresh-token sessions for this account (device / browser list). */
export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: authApi.listSessions,
  });
}

/** Revoke (sign out) a single session, then refresh the list. */
export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

/** Change the account password (current + new). */
export function useChangePassword() {
  return useMutation({
    mutationFn: (vars: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(vars.currentPassword, vars.newPassword),
  });
}

/** Begin TOTP enrolment - returns the secret / otpauth URL to confirm against. */
export function useSetupTwoFactor() {
  return useMutation({
    mutationFn: () => authApi.setupTwoFactor(),
  });
}

/** Confirm a 6-digit code to turn two-factor on, then refresh the user. */
export function useEnableTwoFactor() {
  const refreshUser = useAuthStore((state) => state.refreshUser);
  return useMutation({
    mutationFn: (code: string) => authApi.enableTwoFactor(code),
    onSuccess: () => refreshUser(),
  });
}

/** Confirm a 6-digit code to turn two-factor off, then refresh the user. */
export function useDisableTwoFactor() {
  const refreshUser = useAuthStore((state) => state.refreshUser);
  return useMutation({
    mutationFn: (code: string) => authApi.disableTwoFactor(code),
    onSuccess: () => refreshUser(),
  });
}
