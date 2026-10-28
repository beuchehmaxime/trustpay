import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { disputesApi, type DisputeDetail } from '@/lib/api/disputes.api';

/** Live disputes list - replaces the static `disputes` demo import. */
export function useDisputes() {
  return useQuery({
    queryKey: ['disputes'],
    queryFn: disputesApi.list,
  });
}

/** Live single dispute - replaces the static `disputeDetails[id]` demo lookup. */
export function useDispute(id: string) {
  return useQuery({
    queryKey: ['dispute', id],
    queryFn: () => disputesApi.byId(id),
    enabled: !!id,
  });
}

/**
 * After any dispute mutation, seed the fresh detail and refresh the list plus
 * money/contract state (a withdrawal moves the milestone back to review).
 */
function onDisputeUpdated(qc: ReturnType<typeof useQueryClient>, dispute: DisputeDetail) {
  qc.setQueryData(['dispute', dispute.id], dispute);
  qc.invalidateQueries({ queryKey: ['disputes'] });
  qc.invalidateQueries({ queryKey: ['contracts'] });
}

export function useDisputeMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: string }) => disputesApi.message(args.id, args.body),
    onSuccess: (dispute) => onDisputeUpdated(qc, dispute),
  });
}

export function useAddEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; images: string[]; description?: string }) =>
      disputesApi.addEvidence(args.id, { images: args.images, description: args.description }),
    onSuccess: (dispute) => onDisputeUpdated(qc, dispute),
  });
}

export function useWithdrawDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => disputesApi.withdraw(id),
    onSuccess: (dispute) => onDisputeUpdated(qc, dispute),
  });
}
