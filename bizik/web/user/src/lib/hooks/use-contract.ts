import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { contractsApi, type Contract } from '@/lib/api/contracts.api';
import { escrowApi, type DisputeReason } from '@/lib/api/escrow.api';

/** Single live project (deal) by id - powers the deal detail page. */
export function useContract(id: string) {
  return useQuery({
    queryKey: ['contract', id],
    queryFn: () => contractsApi.byId(id),
    enabled: !!id,
  });
}

/** Refresh the contract cache + dependent lists after a work-flow mutation. */
function useContractMutation<TArgs>(fn: (args: TArgs) => Promise<Contract>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      queryClient.setQueryData(['contract', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', data.id] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/** Create a new project. Invalidates the deals list on success. */
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: contractsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  });
}

/** Counterparty confirms a project they were invited to. */
export function useAcceptDeal() {
  return useContractMutation((id: string) => contractsApi.accept(id));
}

/** Invitee declines a project they were invited to (cancels it). */
export function useDeclineDeal() {
  return useContractMutation((id: string) => contractsApi.decline(id));
}

/**
 * Creator cancels their own deal. Allowed only while nothing has been funded -
 * once a milestone holds money the deal is locked (refund/dispute instead).
 */
export function useCancelDeal() {
  return useContractMutation((args: { contractId: string; reason?: string }) =>
    contractsApi.cancel(args.contractId, args.reason),
  );
}

/** Nudge the other party about this deal's pending step (either side may). */
export function useRemindCounterparty() {
  return useMutation({ mutationFn: (contractId: string) => contractsApi.remind(contractId) });
}

/** Creator cancels one unfunded milestone of their deal (the rest stays). */
export function useCancelMilestone() {
  return useContractMutation((milestoneId: string) => contractsApi.cancelMilestone(milestoneId));
}

/** Creator marks the whole project completed. */
export function useCompleteProject() {
  return useContractMutation((id: string) => contractsApi.complete(id));
}

/** Payee submits a deliverable for a milestone. */
export function useSubmitWork() {
  return useContractMutation((args: { milestoneId: string; note?: string; images?: string[] }) =>
    contractsApi.submitWork(args.milestoneId, { note: args.note, images: args.images }),
  );
}

/** Payer requests a revision (written feedback). */
export function useRequestRevision() {
  return useContractMutation((args: { milestoneId: string; feedback: string }) =>
    contractsApi.requestRevision(args.milestoneId, args.feedback),
  );
}

/**
 * Payer funds a pending milestone's escrow. Pass `payoutMethodId` to charge a
 * saved payment method (MoMo / bank / …); omit it to fund from the wallet.
 */
export function useFundMilestone() {
  return useContractMutation((args: string | { milestoneId: string; payoutMethodId?: string }) => {
    const milestoneId = typeof args === 'string' ? args : args.milestoneId;
    const payoutMethodId = typeof args === 'string' ? undefined : args.payoutMethodId;
    return escrowApi.fundMilestone(milestoneId, payoutMethodId ? { payoutMethodId } : undefined);
  });
}

/**
 * Charge a Mobile Money number to fund a milestone. Unlike the wallet path this
 * does NOT return an updated deal - the payer still has to approve the prompt on
 * their phone - so it gets its own hook rather than the contract-returning one.
 */
export function useFundFromNumber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { milestoneId: string; payoutMethodId?: string; phoneNumber?: string }) =>
      escrowApi.fundFromNumber(args.milestoneId, {
        payoutMethodId: args.payoutMethodId,
        phoneNumber: args.phoneNumber,
      }),
    onSuccess: () => {
      // Nothing has moved yet - refresh so the deal reflects it once it does.
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/** Payer approves a submitted milestone, releasing the funds. */
export function useReleaseMilestone() {
  return useContractMutation((milestoneId: string) => escrowApi.releaseMilestone(milestoneId));
}

/** Either party opens a dispute on a milestone. */
export function useDisputeMilestone() {
  return useContractMutation(
    (args: { milestoneId: string; reason: DisputeReason; description: string; images?: string[] }) =>
      escrowApi.disputeMilestone(args.milestoneId, {
        reason: args.reason,
        description: args.description,
        images: args.images,
      }),
  );
}
