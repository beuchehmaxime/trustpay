/**
 * Cheap, dependency-free intent tests used to route an inbound message before
 * (and instead of) paying for an AI turn. Kept separate from the service so the
 * rules can be reasoned about - and tested - on their own.
 */

/**
 * Every word users bring for the thing BiZik calls a "deal". The display name
 * is ours to choose; the vocabulary people type is not - a seller may call it an
 * invoice, a buyer an order, a francophone user "un accord" or "une facture".
 * All of them mean the same object, so all of them must route the same way.
 */
export const DEAL_WORDS = [
  'deal',
  'deals',
  'invoice',
  'invoices',
  'order',
  'orders',
  'contract',
  'contracts',
  'transaction',
  'transactions',
  'escrow',
  'milestone',
  'invite',
  'invitation',
  // French - "accord" is the noun BiZik uses in FR; the rest are what users say.
  'accord',
  'accords',
  'facture',
  'factures',
  'commande',
  'commandes',
  'contrat',
  'contrats',
  'jalon',
  'sequestre',
  'séquestre',
];

/** Regex alternation over {@link DEAL_WORDS}, as a word-bounded group. */
export function dealWordPattern(): RegExp {
  return new RegExp(`\\b(?:${DEAL_WORDS.join('|')})\\b`, 'i');
}

/** Pull a deal reference (QTQ-YYYYMMDD-XXXXXX) out of free text, if present. */
export function dealRefIn(text: string): string | null {
  const match = text.match(/QTQ-\d{8}-[A-Z0-9]+/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * "Show me my deals" and its many phrasings. Listing what you already have is
 * pure read-only, costs nothing, and must work in every state of the account -
 * including while verification is pending - so it is answered deterministically
 * instead of depending on the model choosing the right tool.
 */
const LIST_VERB =
  /\b(list|show|see|view|display|what are|which are|check)\b|\b(liste|lister|montre|montrer|affiche|afficher|voir)\b/i;
const OWNED = /\b(my|mine|i (have )?(created|made)|invited|shared with me)\b|\b(mes|mon|ma|invit)/i;

export function looksLikeDealListRequest(text: string): boolean {
  const lower = text.trim().toLowerCase();
  // "my deals" on its own is a request; so is any list-verb + deal word.
  if (!dealWordPattern().test(lower)) return false;
  if (/^(my|mes)\s+(deals?|accords?)\b/.test(lower)) return true;
  if (!LIST_VERB.test(lower)) return false;
  // A listing verb plus a deal word is enough; ownership words make it certain.
  return OWNED.test(lower) || /\b(deals|accords)\b/i.test(lower);
}

/**
 * "send 5000 to @handle" - parsed WITHOUT the model.
 *
 * This exact phrasing is advertised in the menu, so it must work even when the
 * assistant's brain is unreachable: an outage at the model provider should
 * never stop someone paying a person they named explicitly. Returns null unless
 * the message is unambiguous - a recipient that is clearly a handle or a phone
 * number, and one plain amount. Anything less certain goes to the model, which
 * can ask a clarifying question.
 */
const SEND_VERB = /\b(send|transfer|wire|envoie|envoyer|envoi|virer|transf[ée]rer)\b/i;
const CURRENCY_WORD = /\b(fcfa|xaf|usd|eur|gbp|ngn|ghs)\b/i;

const CURRENCY_BY_WORD: Record<string, string> = {
  fcfa: 'XAF',
  xaf: 'XAF',
  usd: 'USD',
  eur: 'EUR',
  gbp: 'GBP',
  ngn: 'NGN',
  ghs: 'GHS',
};

export interface ParsedSend {
  /** Handle (with @) or phone number, exactly as the user wrote it. */
  to: string;
  amount: number;
  /** Only set when the user named one; otherwise the caller uses their own. */
  currency?: string;
}

export function parseSendMoney(text: string): ParsedSend | null {
  const raw = text.trim();
  if (!SEND_VERB.test(raw)) return null;
  // "send the deal", "transfer to escrow" - a different subject entirely.
  if (dealWordPattern().test(raw)) return null;

  // amount … to … recipient. The recipient must LOOK like one: @handle, or a
  // phone number of at least 8 digits. A bare word is too risky to act on.
  const match = raw.match(
    /(\d[\d\s,.]*)\s*([a-zA-Z]{3,4})?\s*(?:to|for|à|a|au)\s+(@[a-z0-9._-]{2,}|\+?[\d][\d\s-]{7,})/i,
  );
  if (!match) return null;

  const amount = Number(match[1].replace(/[\s,]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // A currency may sit before or after the amount ("5000 XAF", "FCFA 5000").
  const named = match[2] && CURRENCY_WORD.test(match[2]) ? match[2] : raw.match(CURRENCY_WORD)?.[0];
  const currency = named ? CURRENCY_BY_WORD[named.toLowerCase()] : undefined;

  return { to: match[3].replace(/\s|-/g, ''), amount, currency };
}

/**
 * "deposit 5000", "add 10000 to my wallet", "top up 2000" - parsed without the
 * model, for the same reason as a transfer: adding your own money is an
 * unambiguous instruction and must survive a provider outage. The amount is
 * optional; "I want to deposit" alone still routes here so we can ask how much.
 */
const DEPOSIT_VERB =
  /\b(deposit|top ?up|topup|recharge|add money|add funds|fund my wallet|load my wallet)\b|\b(d[ée]poser|recharger|approvisionner|alimenter)\b/i;

export interface ParsedDeposit {
  /** Undefined when they said "deposit" without a figure - ask them. */
  amount?: number;
  currency?: string;
}

export function parseDeposit(text: string): ParsedDeposit | null {
  const raw = text.trim();
  if (!DEPOSIT_VERB.test(raw)) return null;
  // "deposit into the deal" is escrow funding, a different flow entirely.
  if (dealWordPattern().test(raw)) return null;
  // "add 5000 to @handle" is a transfer, not a top-up.
  if (/@[a-z0-9._-]{2,}/i.test(raw)) return null;

  const amountMatch = raw.match(/(\d[\d\s,.]*)/);
  const amount = amountMatch ? Number(amountMatch[1].replace(/[\s,]/g, '')) : undefined;
  const named = raw.match(CURRENCY_WORD)?.[0];
  return {
    amount: Number.isFinite(amount) && (amount as number) > 0 ? amount : undefined,
    currency: named ? CURRENCY_BY_WORD[named.toLowerCase()] : undefined,
  };
}

/**
 * Is this message actually ASKING to cancel something? The word also turns up in
 * questions ABOUT cancellation - "list my deals that have not been cancelled",
 * "why was it cancelled?" - which must reach the assistant, not the cancel flow.
 * Two rules keep them apart, in both languages: the PAST PARTICIPLE
 * ("cancelled", "annulé") is a status rather than a request, and any
 * listing/asking verb means they want information.
 */
const CANCEL_VERB = /\bcancel(l?ing)?\b|\bannul(er|e|ez|ons|ation)\b/i;
const ASKING_VERB =
  /\b(list|show|see|view|display|which|what|why|when|how many|status|check|liste|lister|montre|montrer|affiche|afficher|quels|quelles|pourquoi|combien|statut)\b/i;

export function looksLikeCancelRequest(text: string): boolean {
  const lower = text.trim().toLowerCase();
  // "cancelled" / "annulé" describe a state - only the verb form is a request.
  if (!CANCEL_VERB.test(lower)) return false;
  if (ASKING_VERB.test(lower)) return false;
  return dealWordPattern().test(lower) || !!dealRefIn(lower);
}

