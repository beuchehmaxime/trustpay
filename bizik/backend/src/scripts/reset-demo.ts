import { readFileSync } from 'fs';
import { join } from 'path';

import { config } from '../config/env';
import { ContractService } from '../contract/contract.service';
import { EscrowService } from '../escrow/escrow.service';
import { prisma } from '../lib/prisma';

/**
 * Put the demo stack back to a clean, recordable state.
 *
 *   docker compose exec backend node dist/scripts/reset-demo.js
 *
 * Run it after every rehearsal. A take consumes the deals - raising a dispute
 * cannot be undone, and a resolved dispute cannot be re-opened - so without
 * this, the second attempt at a recording has nothing to demonstrate.
 *
 * What it leaves alone: the accounts themselves, their verification tier,
 * their handles. Those are identity, not demo state.
 *
 * What it rebuilds: two deals, both funded, delivered, and waiting for the
 * buyer's approval. That is the one state a dispute can be raised FROM, so
 * either deal can carry the live demonstration and the other is a spare if a
 * take goes wrong.
 *
 * Both deliveries carry a real photograph, attached to the SUBMISSION rather
 * than to a dispute. That ordering matters: evidence can only be added to a
 * dispute that already exists, so a deal which has not been disputed yet
 * could otherwise never have a picture on it - and the photograph is the
 * whole point of the mediation demo.
 */

const STARTING_BALANCE = 500_000;

const DEALS = [
  {
    title: 'Ten dining chairs',
    description: 'Ten matching dining chairs, delivered to Akwa.',
    amount: 250_000,
    milestone: 'Delivery of ten chairs',
    deliveryNote: 'Chairs delivered to Akwa this morning, handed to the security man.',
    photo: 'chairs.jpg',
  },
  {
    title: 'Office desk and two shelves',
    description: 'One office desk and two wall shelves, delivered to Bonanjo.',
    amount: 60_000,
    milestone: 'Desk and shelves',
    deliveryNote: 'Desk and both shelves dropped at Bonanjo reception.',
    photo: 'desk.jpg',
  },
];

/** Never on a stack wired to a live money rail. */
function assertDemoStack(): void {
  if (config.payments?.mode && config.payments.mode !== 'simulated') {
    throw new Error(
      `Refusing to reset: PAYMENTS_MODE is "${config.payments.mode}", not "simulated".`,
    );
  }
}

function photoAsDataUrl(name: string): string | null {
  try {
    // demo-assets sits beside dist/ at the image root, not inside it.
    const bytes = readFileSync(join(__dirname, '..', '..', 'demo-assets', name));
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
  } catch {
    // A missing photo is not worth failing a reset over; the deal is still
    // usable, it just has nothing for the vision step to read.
    console.warn(`  (no demo photo found for ${name} - the deal will have no picture)`);
    return null;
  }
}

async function wipeDealState(): Promise<void> {
  // Disputes FIRST, and explicitly.
  //
  // `Dispute.contractId` is a soft reference with no foreign key, so deleting
  // the deals does NOT take the disputes with them. The first version of this
  // left two orphans behind: still listed in the mediator queue, still
  // counted in its totals, showing "Project / Milestone" and $0.00 because
  // the deal they pointed at no longer existed.
  //
  // Their own children - evidence, messages, timeline, ruling, the AI
  // recommendation - DO cascade from the dispute, so they go with it.
  const disputes = await prisma.dispute.deleteMany({});

  // Everything else that points at a deal by a SOFT reference.
  //
  // Six tables carry `contractId` with no foreign key behind it, so none of
  // them go when the deal does. Leaving them behind is how the mediator queue
  // ended up listing two disputes whose deals did not exist, showing
  // "Project / Milestone" and $0.00.
  //
  // Listed explicitly rather than discovered, so a new soft reference added
  // later fails loudly here instead of quietly surviving a reset.
  const escrow = await prisma.escrowAccount.deleteMany({});
  const invitations = await prisma.contractInvitation.deleteMany({});
  const intents = await prisma.paymentIntent.deleteMany({});
  const fees = await prisma.feeRecord.deleteMany({});
  const threads = await prisma.messageThread.deleteMany({});
  const reviews = await prisma.review.deleteMany({});

  // Contracts cascade to milestones and submissions.
  const contracts = await prisma.contract.deleteMany({});
  const transfers = await prisma.transfer.deleteMany({});
  const files = await prisma.file.deleteMany({
    where: { purpose: { in: ['dispute', 'deliverable'] } },
  });
  const conversations = await prisma.assistantConversation.deleteMany({});

  console.log(
    `  cleared: ${disputes.count} dispute(s), ${contracts.count} deal(s), ` +
      `${escrow.count} escrow account(s), ${transfers.count} transfer(s), ` +
      `${files.count} file(s), ${conversations.count} conversation(s)`,
  );
  console.log(
    `  also: ${invitations.count} invitation(s), ${intents.count} payment intent(s), ` +
      `${fees.count} fee record(s), ${threads.count} thread(s), ${reviews.count} review(s)`,
  );
  console.log('  ledger: left intact (append-only; corrected by adjustment below)');
}

/**
 * Put every wallet back to its starting balance by ADJUSTING it, not by
 * erasing what happened.
 *
 * The first version of this deleted the ledger rows. Postgres refused:
 *
 *   wallet_transactions is append-only: DELETE is not permitted. Correct a
 *   mistake by inserting a compensating ADJUSTMENT entry, never by altering
 *   history.
 *
 * That trigger is right and this now does what it says. The ledger keeps the
 * whole story - the funding, the releases, the demo top-ups - and one entry
 * per wallet brings the running total back to the starting figure. The
 * balance then still equals the sum of its ledger, which is the invariant the
 * reconciliation job checks every hour.
 */
async function resetWallets(): Promise<void> {
  const traders = await prisma.user.findMany({
    where: { username: { in: ['marie.demo', 'paul.demo'] } },
    select: { id: true, username: true },
  });

  for (const trader of traders) {
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId_currency: { userId: trader.id, currency: 'XAF' } },
        create: { userId: trader.id, currency: 'XAF', balance: 0, status: 'ACTIVE' },
        update: {},
      });

      const ledger = await tx.walletTransaction.aggregate({
        where: { walletId: wallet.id },
        _sum: { amount: true },
      });
      const correction = STARTING_BALANCE - Number(ledger._sum.amount ?? 0);

      if (correction !== 0) {
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'ADJUSTMENT',
            amount: correction,
            currency: 'XAF',
            balanceAfter: STARTING_BALANCE,
            referenceType: 'topup',
            description: 'Demo reset to starting balance',
          },
        });
      }
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: STARTING_BALANCE },
      });
    });
    console.log(`  ${trader.username}: ${STARTING_BALANCE.toLocaleString('en-US')} XAF`);
  }

  // Any other wallet (a throwaway test account) is brought to match its own
  // ledger rather than forced to zero, for the same reason.
  const others = await prisma.wallet.findMany({
    where: { userId: { notIn: traders.map((trader) => trader.id) } },
    select: { id: true },
  });
  for (const wallet of others) {
    const ledger = await prisma.walletTransaction.aggregate({
      where: { walletId: wallet.id },
      _sum: { amount: true },
    });
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: Number(ledger._sum.amount ?? 0) },
    });
  }
}

/** Clear the transaction PIN so the demo can set one on camera. */
async function clearPins(): Promise<void> {
  const cleared = await prisma.whatsAppChannel.updateMany({
    data: { pinHash: null, pinFailures: 0, locked: false },
  });
  console.log(`  cleared ${cleared.count} transaction PIN(s)`);
}

async function buildDeals(): Promise<void> {
  const marie = await prisma.user.findUniqueOrThrow({ where: { phone: '+237670000001' } });
  const paul = await prisma.user.findUniqueOrThrow({ where: { phone: '+237670000002' } });
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const deal of DEALS) {
    // Marie buys, Paul sells. Every step goes through the real service, so
    // the ledger and the escrow end up in a state the app could have reached
    // on its own.
    const created = (await ContractService.create(marie.id, {
      title: deal.title,
      description: deal.description,
      currency: 'XAF',
      counterpartyName: 'Paul Mbarga',
      counterpartyPhone: paul.phone!,
      creatorIsPayer: true,
      milestones: [{ title: deal.milestone, amount: deal.amount, dueDate }],
    })) as unknown as { id: string };

    await ContractService.accept(paul.id, created.id);

    const contract = await prisma.contract.findUniqueOrThrow({
      where: { id: created.id },
      include: { milestones: true },
    });
    const milestone = contract.milestones[0];

    await EscrowService.fundMilestone(marie.id, milestone.id);

    const image = photoAsDataUrl(deal.photo);
    await ContractService.submitWork(paul.id, milestone.id, {
      note: deal.deliveryNote,
      images: image ? [image] : undefined,
    });

    console.log(
      `  ${deal.title}: funded ${deal.amount.toLocaleString('en-US')} XAF, delivered` +
        `${image ? ' with a photo' : ''}, awaiting approval`,
    );
  }
}

async function main(): Promise<void> {
  assertDemoStack();

  console.log('\nClearing deal state...');
  await wipeDealState();

  console.log('\nResetting wallets...');
  await resetWallets();

  console.log('\nClearing PINs...');
  await clearPins();

  console.log('\nBuilding two deals...');
  await buildDeals();

  // Topped up AGAIN, because funding the deals moved money into escrow and
  // left the buyer short. Doing it afterwards rather than raising the
  // starting figure keeps a round 500,000 on screen for both parties, which
  // is one less thing to explain on camera. It is an ADJUSTMENT like any
  // other, so the ledger still adds up.
  console.log('\nTopping wallets back up after funding...');
  await resetWallets();

  // The invariant that matters: every balance must equal the sum of its
  // ledger. Checked here rather than trusted, because the last time it was
  // trusted the console raised a critical alert mid-demo.
  const drift = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) FROM (
      SELECT w.id FROM wallets w
      LEFT JOIN wallet_transactions t ON t."walletId" = w.id
      GROUP BY w.id, w.balance
      HAVING w.balance - COALESCE(SUM(t.amount), 0) <> 0
    ) drifted`;

  console.log(`
Clean slate.

  Marie Ngo    +237670000001  buyer   - funded both deals
  Paul Mbarga  +237670000002  seller  - delivered both
  Password     Demo1234!      (no PIN set; the demo creates one)

  Both deals are DELIVERED and AWAITING APPROVAL, which is the only state a
  dispute can be raised from. Use either; the other is your spare take.

  Wallets reconcile: ${Number(drift[0].count) === 0 ? 'yes, zero drift' : `NO - ${drift[0].count} wallet(s) adrift`}
`);
}

main()
  .catch((error) => {
    console.error('[reset] failed:', (error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
