import { describe, expect, it } from 'vitest';

import { lockWalletsInOrder } from './ledger';

/**
 * A fake transaction client that records which wallets got locked, in order.
 * The real lock is the `SELECT … FOR UPDATE` inside ensureWallet; what matters
 * here is the ORDER the rows are taken in, because that is what decides whether
 * two opposite transfers deadlock.
 */
function fakeTx() {
  const lockOrder: string[] = [];
  const tx = {
    wallet: {
      upsert: async ({ where }: { where: { userId_currency: { userId: string } } }) => {
        const userId = where.userId_currency.userId;
        lockOrder.push(userId);
        return { id: `wallet-${userId}`, userId, balance: 0 };
      },
    },
    $queryRaw: async () => [{ balance: 0 }],
  };
  return { tx, lockOrder };
}

describe('lockWalletsInOrder', () => {
  it('locks wallets in a fixed global order regardless of who is paying whom', async () => {
    const forward = fakeTx();
    await lockWalletsInOrder(forward.tx as never, ['user-b', 'user-a'], 'XAF');

    const reverse = fakeTx();
    await lockWalletsInOrder(reverse.tx as never, ['user-a', 'user-b'], 'XAF');

    // A→B and B→A must queue on the same row first, or Postgres kills one of
    // them with a deadlock.
    expect(forward.lockOrder).toEqual(['user-a', 'user-b']);
    expect(reverse.lockOrder).toEqual(['user-a', 'user-b']);
  });

  it('locks a wallet once even if the same user appears twice', async () => {
    const { tx, lockOrder } = fakeTx();
    await lockWalletsInOrder(tx as never, ['user-a', 'user-a'], 'XAF');
    expect(lockOrder).toEqual(['user-a']);
  });

  it('handles a single participant', async () => {
    const { tx, lockOrder } = fakeTx();
    await lockWalletsInOrder(tx as never, ['solo'], 'XAF');
    expect(lockOrder).toEqual(['solo']);
  });
});
