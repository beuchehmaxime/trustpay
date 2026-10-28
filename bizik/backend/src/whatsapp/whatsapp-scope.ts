import { DEAL_WORDS } from './whatsapp-intent';

/**
 * Keeping the assistant inside BiZik.
 *
 * A system prompt asking a model to "stay in scope" is a request, not a
 * boundary - it bends under a determined user and drifts on a long thread. So
 * scope is enforced on both sides of the model instead: obvious off-topic asks
 * are answered before a turn is ever paid for, and any reply that wandered out
 * of the product is replaced before the user sees it.
 *
 * Both checks are deliberately HIGH PRECISION. Wrongly refusing a real customer
 * is worse than occasionally letting a stray question through, so anything that
 * mentions BiZik's own subject matter is always allowed to reach the model.
 */

/** Words that mean the message is about BiZik's business, in EN and FR. */
const DOMAIN_TERMS = [
  ...DEAL_WORDS,
  'bizik',
  'money',
  'cash',
  'pay',
  'paid',
  'payment',
  'fund',
  'funding',
  'wallet',
  'balance',
  'withdraw',
  'withdrawal',
  'deposit',
  'send',
  'receive',
  'refund',
  'release',
  'buyer',
  'seller',
  'delivery',
  'deliver',
  'dispute',
  'verify',
  'verified',
  'verification',
  'kyc',
  'handle',
  'account',
  'fee',
  'fees',
  'momo',
  'mtn',
  'orange',
  'bank',
  'xaf',
  'fcfa',
  'naira',
  'cedi',
  // French
  'argent',
  'payer',
  'paiement',
  'portefeuille',
  'solde',
  'retrait',
  'retirer',
  'depot',
  'dépôt',
  'envoyer',
  'recevoir',
  'remboursement',
  'acheteur',
  'vendeur',
  'livraison',
  'livrer',
  'litige',
  'vérifier',
  'verifier',
  'compte',
  'frais',
];

const DOMAIN_PATTERN = new RegExp(`\\b(?:${DOMAIN_TERMS.join('|')})`, 'i');

/** Does this text talk about BiZik's business at all? */
export function mentionsDomain(text: string): boolean {
  return DOMAIN_PATTERN.test(text);
}

/**
 * Unmistakable requests for a general-purpose assistant. Each pattern is one a
 * payments product would never legitimately receive; combined with the
 * domain-term check below, a message has to be BOTH clearly off-topic AND free
 * of any BiZik subject matter before it is refused.
 */
const OFF_TOPIC_PATTERNS: RegExp[] = [
  // "write me a poem / essay / code / song…"
  // Allows a few words between the article and the noun, so "write a python
  // script" and "draft a short thank-you poem" are both caught.
  /\b(write|compose|draft|generate|create|make)\s+(?:me\s+)?(?:a|an|some|the)?\s*(?:\w+\s+){0,3}(poem|essay|story|novel|song|lyrics?|joke|code|script|program|app|website|blog|article|speech|cv|resume|homework)\b/i,
  // "translate this into Spanish"
  /\btranslate\b[\s\S]*\b(to|into|en)\b/i,
  // General knowledge probes.
  /\b(capital|population|president|prime minister|king|queen)\s+of\b/i,
  /\bwho\s+(is|was)\s+(the\s+)?(president|prime minister|king|queen|pope|richest)\b/i,
  /\bwhat\s+(is|are)\s+the\s+(meaning|definition)\s+of\s+life\b/i,
  // Weather, sport, entertainment, cooking.
  /\b(weather|forecast|temperature outside)\b/i,
  /\b(football|soccer|basketball|premier league|world cup|champions league|match (score|result))\b/i,
  /\b(recipe|how (do|to) (i )?cook|ingredients for)\b/i,
  /\btell me a (joke|story|riddle)\b/i,
  // Advice a money app must not give.
  /\b(symptoms?|diagnos\w*|medication|dosage|prescription|cure for)\b/i,
  /\b(legal advice|sue (him|her|them)|lawsuit against)\b/i,
  // Homework-style maths.
  /\bwhat('| i)?s\s+\d+\s*[+\-*/x]\s*\d+/i,
  /\bsolve\b[\s\S]*\b(equation|algebra|integral)\b/i,
  // Meta / jailbreak probes at the model itself.
  /\b(ignore|disregard)\s+(all\s+)?(your\s+)?(previous\s+)?(instructions|rules|prompt)\b/i,
  /\b(system prompt|your prompt|you are chatgpt|act as|pretend to be|roleplay)\b/i,
];

/**
 * Should this message be answered with a scope redirect INSTEAD of a model
 * turn? True only when it matches an off-topic pattern and says nothing about
 * BiZik's business - so "who is the buyer on my deal" is never caught, while
 * "who is the president of Cameroon" is.
 */
export function isClearlyOutOfScope(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return false;
  if (mentionsDomain(trimmed)) return false;
  return OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Signs that a REPLY left the product. Used as a last line of defence on what
 * the model produced: short answers are left alone (they are usually
 * conversational glue), but code, "as an AI" disclaimers, or a long essay that
 * never once mentions BiZik's business did not come from this assistant's job.
 */
const ESSAY_LENGTH = 400;

export function replyLeftScope(reply: string): boolean {
  const text = reply.trim();
  if (!text) return false;
  if (text.includes('```')) return true; // code blocks
  if (/\bas an ai\b|\bi am an ai\b|\blanguage model\b/i.test(text)) return true;
  return text.length > ESSAY_LENGTH && !mentionsDomain(text);
}

/** What we say instead - friendly, and pointing back at what we do handle. */
export function outOfScopeReply(locale: 'en' | 'fr'): string {
  if (locale === 'fr') {
    return (
      "Je m'occupe uniquement de BiZik : accords sécurisés, séquestre, votre portefeuille et " +
      "l'envoi d'argent. Je ne peux pas vous aider sur ce sujet.\n\n" +
      'Tapez *MENU* pour voir ce que je peux faire.'
    );
  }
  return (
    'I only handle BiZik: secure deals, escrow payments, your wallet and sending money. ' +
    "That one is outside what I can help with.\n\n" +
    'Type *MENU* to see what I can do.'
  );
}
