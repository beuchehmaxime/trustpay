import { config } from '../config/env';
import { ContractService } from '../contract/contract.service';
import { EscrowService } from '../escrow/escrow.service';
import { prisma } from '../lib/prisma';

/**
 * A deal that went wrong, for the admin console and the assistant to work on.
 *
 * Run it with:
 *
 *   docker compose exec backend node dist/scripts/seed-demo-scenario.js
 *
 * The dispute queue, the mediator console and the assistant's dispute tools all
 * had nothing to show, because nothing had ever gone wrong on this stack. This
 * builds the one case that makes all three demonstrable:
 *
 *   Marie buys ten chairs from Paul, funds the escrow, Paul marks them
 *   delivered, and only four arrive.
 *
 * Every step runs through the real service - create, accept, fund, submit,
 * dispute - rather than writing rows directly. That matters for two reasons.
 * The ledger stays honest, so the reconciliation job does not raise a critical
 * alert on seeded data. And the resulting case is a REAL one: the escrow is
 * genuinely frozen, the milestone genuinely disputed, and the console is
 * looking at the same shape of record it would see in production.
 *
 * Idempotent by title: re-running finds the existing deal and leaves it alone
 * rather than filling the queue with copies.
 */

const DEAL_TITLE = 'Ten dining chairs';
const AMOUNT = 250_000;

/** Same guard as the account seed: never on a stack with a live money rail. */
function assertDemoStack(): void {
  if (config.payments?.mode && config.payments.mode !== 'simulated') {
    throw new Error(
      `Refusing to seed: PAYMENTS_MODE is "${config.payments.mode}", not "simulated".`,
    );
  }
}

async function findUser(phone: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new Error(`${phone} not found. Run seed-demo-accounts.js first.`);
  }
  return user;
}

async function main(): Promise<void> {
  assertDemoStack();

  // Marie buys, Paul sells. Marie is the one who will be unhappy, and she is
  // also the French speaker, so the demo shows the assistant switching.
  const marie = await findUser('+237670000001');
  const paul = await findUser('+237670000002');

  const existing = await prisma.contract.findFirst({
    where: { title: DEAL_TITLE, creatorId: marie.id },
    include: { milestones: true },
  });
  if (existing) {
    console.log(`Already seeded: "${DEAL_TITLE}" (${existing.id}), status ${existing.status}.`);
    return;
  }

  // 1. Marie creates the deal and invites Paul. She pays, so creatorIsPayer.
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const created = (await ContractService.create(marie.id, {
    title: DEAL_TITLE,
    description: 'Ten matching dining chairs, delivered to Akwa.',
    currency: 'XAF',
    counterpartyName: 'Paul Mbarga',
    counterpartyPhone: paul.phone!,
    creatorIsPayer: true,
    milestones: [{ title: 'Delivery of ten chairs', amount: AMOUNT, dueDate }],
  })) as unknown as { id: string };
  console.log(`  created  ${created.id}`);

  // 2. Paul accepts the invitation.
  await ContractService.accept(paul.id, created.id);
  console.log('  accepted by Paul');

  // 3. Marie funds the escrow from her wallet.
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: created.id },
    include: { milestones: true },
  });
  const milestone = contract.milestones[0];
  await EscrowService.fundMilestone(marie.id, milestone.id);
  console.log(`  funded   ${AMOUNT.toLocaleString('en-US')} XAF into escrow`);

  // 4. Paul says the chairs are delivered.
  await ContractService.submitWork(paul.id, milestone.id, {
    note: 'Chairs delivered to Akwa this morning, handed to the security man.',
  });
  console.log('  delivered (submitted by Paul)');

  // 5. Only four arrived. Marie disputes it, in her own words - this is the
  //    text a mediator reads and the model reasons over, so it is written the
  //    way someone actually complains rather than as a tidy summary.
  await EscrowService.fileDispute(marie.id, milestone.id, {
    reason: 'INCOMPLETE_WORK',
    description:
      "J'ai paye pour dix chaises et il n'en a livre que quatre. The thing no complete at all. " +
      'I call am, he say the rest dey come, but since three days nothing. ' +
      'I want my money for the six chairs wey never come.',
  });
  console.log('  DISPUTED by Marie');

  const dispute = await prisma.dispute.findFirstOrThrow({
    where: { contractId: created.id },
    select: { id: true, status: true },
  });

  console.log(`
Scenario ready.

  Deal      ${DEAL_TITLE}, ${AMOUNT.toLocaleString('en-US')} XAF
  Buyer     Marie Ngo   (+237670000001)  filed the dispute
  Seller    Paul Mbarga (+237670000002)
  Dispute   ${dispute.id}, ${dispute.status}

  Admin console   http://localhost:3001/disputes
  User app        http://localhost:3000  - sign in as either party
  Assistant       ask it "what is happening with my dispute?"

  The escrow is genuinely frozen and the milestone genuinely disputed: every
  step above ran through the same services the app uses.
`);
}

main()
  .catch((error) => {
    console.error('[scenario] failed:', (error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
