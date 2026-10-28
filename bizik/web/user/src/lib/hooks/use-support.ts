import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supportApi, type CreateTicketInput, type TicketDetail } from '@/lib/api/support.api';

/** Published help-center articles. */
export function useHelpArticles() {
  return useQuery({
    queryKey: ['support', 'help'],
    queryFn: supportApi.help,
  });
}

/** The signed-in user's support tickets. */
export function useTickets() {
  return useQuery({
    queryKey: ['support', 'tickets'],
    queryFn: supportApi.listTickets,
  });
}

/** A single ticket with its message thread. */
export function useTicket(id: string) {
  return useQuery({
    queryKey: ['support', 'ticket', id],
    queryFn: () => supportApi.ticket(id),
    enabled: Boolean(id),
  });
}

/** Push a fresh ticket detail into the cache + refresh the list. */
function useTicketWriteback() {
  const queryClient = useQueryClient();
  return (ticket: TicketDetail) => {
    queryClient.setQueryData(['support', 'ticket', ticket.id], ticket);
    queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
  };
}

/** Open a new support ticket. */
export function useCreateTicket() {
  const writeBack = useTicketWriteback();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => supportApi.create(input),
    onSuccess: writeBack,
  });
}

/** Reply to an existing ticket. */
export function useReplyTicket() {
  const writeBack = useTicketWriteback();
  return useMutation({
    mutationFn: (vars: { id: string; body: string }) => supportApi.reply(vars.id, vars.body),
    onSuccess: writeBack,
  });
}
