import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The money rule, tested from the attacker's side.
 *
 * The in-app assistant lets a model call tools that move money. The one thing
 * that makes that safe is that the model's turn and the execution are different
 * calls, and only the second one can reach the ledger. So these tests are not
 * written to show the chat works. They are written to try, in every way the
 * HTTP surface allows, to make money move without a human approving it:
 *
 *   - by having the model propose it (the ordinary path)
 *   - by approving an id that was never proposed
 *   - by approving with no PIN, or the wrong one
 *   - by approving the same thing twice
 *   - by approving something the conversation has moved past
 *   - by approving something that has gone stale
 *
 * `executeConfirmed` is the ledger's door. Almost every assertion below is some
 * form of "and that door stayed shut".
 */

// ---- Doubles ---------------------------------------------------------------
// `vi.hoisted` because `vi.mock` factories are lifted above every other
// statement in the file: anything they close over has to be created up there
// with them, or it does not exist yet when they run.
const doubles = vi.hoisted(() => ({
  // In-memory Redis. The session is the thing under test, so it has to behave
  // like a real store across calls rather than be stubbed per assertion.
  store: new Map<string, string>(),
  currentUser: { id: 'user-1', phone: '+237677112233', locale: 'en', kycTier: 2 },
  pin: { hasPin: true, result: 'ok' as 'ok' | 'wrong' | 'locked', left: 4 },
  executeConfirmed: vi.fn(async () => 'Sent 5,000 FCFA to Marie Ngo.'),
  // The conversation store. Messages live in Postgres now, so the record is
  // a double here and the assertions are about WHAT gets written.
  stored: {
    createConversation: vi.fn(async () => 'conv-1'),
    ownsConversation: vi.fn(async () => true),
    append: vi.fn(async () => undefined),
    messages: vi.fn(async () => [] as unknown[]),
    contextFor: vi.fn(async () => [] as unknown[]),
    listConversations: vi.fn(async () => [] as unknown[]),
    latestConversation: vi.fn(async () => null as string | null),
    deleteConversation: vi.fn(async () => true),
    discardIfEmpty: vi.fn(async () => undefined),
  },
  agentTurn: vi.fn(),
  channelByUser: vi.fn(async () => null as { pinHash?: string } | null),
  createChannel: vi.fn(async () => ({})),
}));

const { store, currentUser, pin: pinState, executeConfirmed, agentTurn, createChannel, stored } =
  doubles;

vi.mock('../lib/redis', () => ({
  redis: {
    get: vi.fn(async (key: string) => doubles.store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      doubles.store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      doubles.store.delete(key);
      return 1;
    }),
    sendCommand: vi.fn(async () => null),
  },
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => doubles.currentUser) },
    whatsAppChannel: { create: doubles.createChannel },
  },
}));

vi.mock('../whatsapp/whatsapp.repository', () => ({
  WhatsAppRepository: { getChannelByUser: doubles.channelByUser },
}));

// Verification is a separate concern with its own tests; here it is a switch so
// the money path can be exercised on a verified account and refused on an
// unverified one.
vi.mock('../lib/kyc-gate', () => ({
  isVerifiedTier: vi.fn((tier: number) => tier >= 2),
}));

vi.mock('../whatsapp/whatsapp-security', () => ({
  WhatsAppSecurity: {
    hasPin: vi.fn(async () => doubles.pin.hasPin),
    isValidPinFormat: vi.fn((value: string) => /^\d{4,6}$/.test(value)),
    setPin: vi.fn(async () => undefined),
    verifyPin: vi.fn(async () => ({ result: doubles.pin.result, left: doubles.pin.left })),
  },
}));

vi.mock('./assistant-tools', () => ({
  AssistantTools: {
    run: vi.fn(),
    executeConfirmed: doubles.executeConfirmed,
  },
  ASSISTANT_TOOL_DEFINITIONS: [],
  ASSISTANT_READ_TOOLS: new Set<string>(),
}));

// The model is replaced wholesale. What it would actually say is not the
// subject; what the service does with a proposal is.
vi.mock('./assistant.repository', () => ({
  AssistantRepository: doubles.stored,
  titleFrom: (first: string) => first.slice(0, 60),
}));

vi.mock('./assistant.agent', () => ({
  AssistantAgent: {
    available: () => true,
    run: (...args: unknown[]) => doubles.agentTurn(...args),
  },
}));

import { AppError } from '../lib/errors';
import { AssistantService } from './assistant.service';

const SEND_MONEY = {
  tool: 'send_money',
  args: { recipient: '@marie.ngo', amount: 5000, currency: 'XAF' },
  summary: 'Send 5,000 FCFA to Marie Ngo (@marie.ngo).',
  requiresPin: true,
};

/** Drive one turn that ends in a money proposal, and return its id. */
async function proposeSendMoney(): Promise<string> {
  agentTurn.mockResolvedValueOnce({ text: 'Ready when you are.', pending: SEND_MONEY });
  const result = await AssistantService.chat('user-1', 'send 5000 to @marie.ngo');
  expect(result.proposal).toBeDefined();
  return result.proposal!.id;
}

/** Assert the thrown error, since `rejects.toThrow` loses the status code. */
async function errorFrom(call: Promise<unknown>): Promise<AppError> {
  try {
    await call;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('expected the call to be refused, but it succeeded');
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  currentUser.kycTier = 2;
  pinState.hasPin = true;
  pinState.result = 'ok';
  pinState.left = 4;
});

describe('a model turn cannot move money', () => {
  it('proposes without executing, however the turn ends', async () => {
    await proposeSendMoney();
    expect(executeConfirmed).not.toHaveBeenCalled();
  });

  it('hands the client an id and NOT the arguments', async () => {
    agentTurn.mockResolvedValueOnce({ text: 'Ready.', pending: SEND_MONEY });
    const result = await AssistantService.chat('user-1', 'send 5000 to @marie.ngo');

    // The amount and the recipient stay on the server. A client that cannot see
    // them has nothing to alter and send back.
    expect(result.proposal).not.toHaveProperty('args');
    expect(JSON.stringify(result.proposal)).not.toContain('5000');
    expect(result.proposal!.id).toBeTruthy();
  });

  it('never proposes a gated action to an unverified account', async () => {
    currentUser.kycTier = 0;
    agentTurn.mockResolvedValueOnce({ text: 'Sure.', pending: SEND_MONEY });

    const result = await AssistantService.chat('user-1', 'send 5000 to @marie.ngo');

    // No card, so nothing to approve, so no PIN prompt for something that was
    // never going to go through.
    expect(result.proposal).toBeUndefined();
    expect(result.reply).toMatch(/verified account/i);
    expect(executeConfirmed).not.toHaveBeenCalled();
  });
});

describe('approving something that was not proposed', () => {
  it('refuses an id the server never issued', async () => {
    await proposeSendMoney();

    const error = await errorFrom(AssistantService.confirm('user-1', 'an-id-i-made-up', '1234'));

    expect(error.statusCode).toBe(409);
    expect(executeConfirmed).not.toHaveBeenCalled();
  });

  it('refuses when nothing is pending at all', async () => {
    const error = await errorFrom(AssistantService.confirm('user-1', 'anything', '1234'));

    expect(error.statusCode).toBe(409);
    expect(executeConfirmed).not.toHaveBeenCalled();
  });

  it('drops the old proposal as soon as the conversation moves on', async () => {
    const staleId = await proposeSendMoney();

    // The user said something else instead of approving. The card they were
    // looking at is no longer what they are talking about.
    agentTurn.mockResolvedValueOnce({ text: 'Your balance is 12,000 FCFA.' });
    await AssistantService.chat('user-1', 'actually what is my balance');

    const error = await errorFrom(AssistantService.confirm('user-1', staleId, '1234'));

    expect(error.statusCode).toBe(409);
    expect(executeConfirmed).not.toHaveBeenCalled();
  });
});

describe('the PIN is not optional', () => {
  it('refuses to execute without one', async () => {
    const proposalId = await proposeSendMoney();

    const error = await errorFrom(AssistantService.confirm('user-1', proposalId));

    expect(error.statusCode).toBe(428);
    expect(executeConfirmed).not.toHaveBeenCalled();
  });

  it('refuses a wrong one, and says how many tries are left', async () => {
    const proposalId = await proposeSendMoney();
    pinState.result = 'wrong';
    pinState.left = 3;

    const error = await errorFrom(AssistantService.confirm('user-1', proposalId, '0000'));

    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('3');
    expect(executeConfirmed).not.toHaveBeenCalled();
  });

  it('keeps the proposal alive after a wrong PIN, so a typo is not a restart', async () => {
    const proposalId = await proposeSendMoney();
    pinState.result = 'wrong';
    await errorFrom(AssistantService.confirm('user-1', proposalId, '0000'));

    pinState.result = 'ok';
    const result = await AssistantService.confirm('user-1', proposalId, '1234');

    expect(executeConfirmed).toHaveBeenCalledTimes(1);
    expect(result.reply).toContain('5,000');
  });

  it('throws the proposal away when the PIN locks out', async () => {
    const proposalId = await proposeSendMoney();
    pinState.result = 'locked';

    const lockError = await errorFrom(AssistantService.confirm('user-1', proposalId, '0000'));
    expect(lockError.statusCode).toBe(423);

    // A locked account must not come back to a live money action still waiting.
    pinState.result = 'ok';
    const afterError = await errorFrom(AssistantService.confirm('user-1', proposalId, '1234'));
    expect(afterError.statusCode).toBe(409);
    expect(executeConfirmed).not.toHaveBeenCalled();
  });

  it('asks the user to create a PIN when they have none', async () => {
    pinState.hasPin = false;
    const proposalId = await proposeSendMoney();

    const error = await errorFrom(AssistantService.confirm('user-1', proposalId, undefined));

    expect(error.statusCode).toBe(428);
    expect(error.code).toBe('Q-428-PIN-SETUP');
    expect(executeConfirmed).not.toHaveBeenCalled();
  });
});

describe('approving once means once', () => {
  it('executes with the arguments the SERVER stored', async () => {
    const proposalId = await proposeSendMoney();

    await AssistantService.confirm('user-1', proposalId, '1234');

    expect(executeConfirmed).toHaveBeenCalledTimes(1);
    const [pending, context] = executeConfirmed.mock.calls[0] as unknown as [
      typeof SEND_MONEY,
      { userId: string },
    ];
    expect(pending.tool).toBe('send_money');
    expect(pending.args).toEqual(SEND_MONEY.args);
    expect(context.userId).toBe('user-1');
  });

  it('refuses the same approval a second time', async () => {
    const proposalId = await proposeSendMoney();
    await AssistantService.confirm('user-1', proposalId, '1234');

    const error = await errorFrom(AssistantService.confirm('user-1', proposalId, '1234'));

    expect(error.statusCode).toBe(409);
    expect(executeConfirmed).toHaveBeenCalledTimes(1);
  });

  it('does not leave it approvable when execution fails', async () => {
    const proposalId = await proposeSendMoney();
    executeConfirmed.mockRejectedValueOnce(new AppError(400, 'Q-400', 'Insufficient balance.'));

    const failed = await AssistantService.confirm('user-1', proposalId, '1234');
    expect(failed.reply).toContain('Insufficient balance');

    // The dangerous reading of a failure is "try approving it again" - the
    // transfer may in fact have gone through. One approval, one attempt.
    const error = await errorFrom(AssistantService.confirm('user-1', proposalId, '1234'));
    expect(error.statusCode).toBe(409);
    expect(executeConfirmed).toHaveBeenCalledTimes(1);
  });

  it('does not re-propose the action that just failed', async () => {
    const proposalId = await proposeSendMoney();
    executeConfirmed.mockRejectedValueOnce(new AppError(400, 'Q-400', 'Insufficient balance.'));

    const failed = await AssistantService.confirm('user-1', proposalId, '1234');

    expect(failed.proposal).toBeUndefined();
  });
});

describe('a confirmation goes stale', () => {
  it('expires rather than waiting indefinitely', async () => {
    const proposalId = await proposeSendMoney();

    // Six minutes later the balances it was computed against have moved and the
    // user has forgotten what they agreed to.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);

    const error = await errorFrom(AssistantService.confirm('user-1', proposalId, '1234'));

    expect(error.statusCode).toBe(410);
    expect(executeConfirmed).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('setting a PIN from the app', () => {
  it('does not opt the user into WhatsApp as a side effect', async () => {
    // The PIN is stored on the WhatsApp channel row, and `optIn` defaults to
    // true. Creating that row from the app with the default would sign someone
    // up for WhatsApp messages because they set a PIN in a different product.
    pinState.hasPin = false;

    await AssistantService.setPin('user-1', '4821');

    expect(createChannel).toHaveBeenCalledTimes(1);
    const [call] = createChannel.mock.calls as unknown as [{ data: { optIn: boolean } }][];
    expect(call[0].data.optIn).toBe(false);
  });

  it('refuses to overwrite a PIN that already exists', async () => {
    pinState.hasPin = true;

    const error = await errorFrom(AssistantService.setPin('user-1', '4821'));

    expect(error.statusCode).toBe(409);
    expect(createChannel).not.toHaveBeenCalled();
  });
});

describe('cancelling', () => {
  it('drops the proposal without doing it', async () => {
    const proposalId = await proposeSendMoney();

    await AssistantService.cancel('user-1', proposalId);
    const error = await errorFrom(AssistantService.confirm('user-1', proposalId, '1234'));

    expect(error.statusCode).toBe(409);
    expect(executeConfirmed).not.toHaveBeenCalled();
  });
});

describe('the thread the user comes back to', () => {
  it('writes what the user said down before calling the model', async () => {
    // A turn that times out must not lose the user's own words - they are the
    // half of the exchange that cannot be reproduced.
    agentTurn.mockRejectedValueOnce(new Error('upstream exploded'));

    await AssistantService.chat('user-1', 'what is my balance').catch(() => undefined);

    expect(stored.append).toHaveBeenCalledWith(
      expect.any(String),
      'user',
      'what is my balance',
    );
  });

  it('keeps the messages in the record, not the session', async () => {
    await proposeSendMoney();

    // Both halves are persisted, so a refresh after the Redis session expires
    // still shows the conversation.
    const roles = stored.append.mock.calls.map((call) => (call as unknown as [string, string])[1]);
    expect(roles).toEqual(['user', 'assistant']);
  });

  it('offers a live proposal back on reopen', async () => {
    await proposeSendMoney();

    const thread = await AssistantService.history('user-1');

    expect(thread.proposal).toBeDefined();
    expect(thread.conversationId).toBe('conv-1');
  });

  it('does not offer an expired proposal back', async () => {
    await proposeSendMoney();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);

    const thread = await AssistantService.history('user-1');

    expect(thread.proposal).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('starting a new conversation DELETES nothing', async () => {
    // The old button wiped the thread. That made "start again" destroy a
    // record the user may need, which is why this test exists.
    await proposeSendMoney();

    await AssistantService.newConversation('user-1');

    expect(stored.deleteConversation).not.toHaveBeenCalled();
    // Only the proposal is dropped - approving a card from an abandoned
    // thread is never what was meant.
    const thread = await AssistantService.history('user-1');
    expect(thread.proposal).toBeUndefined();
  });
});
