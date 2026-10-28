import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { settingsApi } from './settings.api';
import type { LegalDocType, LegalUpdateInput, SettingsGroup } from './types';

const SETTINGS_KEY = ['admin', 'settings'] as const;

export function useSettings(enabled: boolean) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, 'overview'],
    queryFn: () => settingsApi.overview(),
    enabled,
  });
}

export function useSaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: ({ group, value }: { group: SettingsGroup; value: any }) =>
      settingsApi.updateGroup(group, value),
    onSuccess: (data) => queryClient.setQueryData([...SETTINGS_KEY, 'overview'], data),
  });
}

export function useSaveLegal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, input }: { type: LegalDocType; input: LegalUpdateInput }) =>
      settingsApi.updateLegal(type, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}
