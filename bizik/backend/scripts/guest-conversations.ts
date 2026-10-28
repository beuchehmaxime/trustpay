/**
 * Run real conversations through the WhatsApp front desk (guests with no
 * account) against the live model, and print what it understood.
 *
 *   node --env-file=../../.env -r ts-node/register/transpile-only scripts/guest-conversations.ts
 *
 * It calls the model and nothing else: no WhatsApp message is sent, no account
 * is created, nothing is written to the database.
 */
import type Anthropic from '@anthropic-ai/sdk';

import { WhatsAppAI } from '../src/whatsapp/whatsapp-ai';
import { looksLikePersonName, type GuestSignupState } from '../src/whatsapp/whatsapp-guest';

interface Step {
  text: string;
  firstContact?: boolean;
}

const CONVERSATIONS: Record<string, Step[]> = {
  'French speaker (screenshot 1)': [
    { text: 'Bonjour', firstContact: true },
    { text: 'Je parle en francaise pourqoui tu ne reponds pas en francaise?' },
  ],
  'Asks how, is not giving a name (screenshot 2)': [{ text: 'How do I create an account', firstContact: true }],
  'Just curious, does not want an account': [
    { text: 'Hi, what is Bizik exactly?', firstContact: true },
    { text: "I'm just asking, I don't want an account" },
  ],
  'Signs up properly': [
    { text: 'I want to open an account', firstContact: true },
    { text: 'Jean Mbarga' },
  ],
  'Asks a question while being asked for their name': [
    { text: 'je veux créer un compte', firstContact: true },
    { text: "C'est sécurisé ? Qui peut voir mon argent ?" },
  ],
  'Gives name and country in one go': [
    { text: "Hello, I'm Amina Okafor from Cameroon and I want to sign up", firstContact: true },
  ],
};

async function run() {
  for (const [title, steps] of Object.entries(CONVERSATIONS)) {
    console.log(`\n=== ${title} ===`);
    const history: Anthropic.MessageParam[] = [];
    let state: GuestSignupState = { step: 'none' };

    for (const step of steps) {
      const result = await WhatsAppAI.understandGuest(step.text, history, { ...state, firstContact: step.firstContact });
      if ('unavailable' in result) {
        console.log(`  USER: ${step.text}\n  -> MODEL UNAVAILABLE`);
        break;
      }
      const decision = result.decision;
      console.log(`  USER: ${step.text}`);
      console.log(
        `  -> intent=${decision.intent} language=${decision.language}` +
          (decision.fullName ? ` full_name="${decision.fullName}" (${looksLikePersonName(decision.fullName) ? 'accepted' : 'REJECTED by name check'})` : '') +
          (decision.country ? ` country="${decision.country}"` : ''),
      );
      console.log(`  BIZIK: ${decision.reply.replace(/\n/g, ' / ')}`);

      history.push({ role: 'user', content: step.text });
      history.push({ role: 'assistant', content: decision.reply });
      // Mirror the service's state transitions closely enough for the next turn.
      if (decision.intent === 'start_signup') state = { step: 'name' };
      if (decision.intent === 'give_name' && looksLikePersonName(decision.fullName)) {
        state = { step: 'country', fullName: decision.fullName };
      }
      if (decision.intent === 'cancel_signup') state = { step: 'none' };
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
