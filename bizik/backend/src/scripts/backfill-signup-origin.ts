/**
 * Fill in where existing accounts signed up from.
 *
 * Signup provenance (client, address, agent string) is recorded at registration
 * now, but every account created before that shows "Not recorded" in the
 * console - which is exactly the population an operator is asking about when
 * they wonder whether a burst of registrations was real.
 *
 * The answer is recoverable: a session is created the moment an account is, and
 * it carries the address and agent string of the request that made it. So the
 * EARLIEST session for a user is, in practice, their signup. Accounts created
 * over WhatsApp have no session at all but do have a channel row, which is what
 * identifies them here.
 *
 * This is an inference, not a record, so it only ever fills columns that are
 * still empty - it never overwrites something registration captured directly.
 *
 * Run once, inside the backend container:
 *   node dist/scripts/backfill-signup-origin.js
 */
import { prisma } from '../lib/prisma';

/** Which client an agent string came from. The mobile app is a React Native
 *  build, so it identifies itself through Expo/okhttp rather than a browser. */
function clientFromUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'web';
  const lower = userAgent.toLowerCase();
  if (lower.includes('expo') || lower.includes('okhttp') || lower.includes('bizik-mobile')) {
    return 'mobile';
  }
  if (lower.includes('darwin') || lower.includes('cfnetwork')) return 'mobile';
  return 'web';
}

async function main() {
  const pending = await prisma.user.findMany({
    where: { signupIp: null, signupSource: null },
    select: { id: true, phone: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!pending.length) {
    console.log('[backfill] nothing to do - every account already has a signup origin.');
    return;
  }
  console.log(`[backfill] ${pending.length} account(s) without a recorded signup origin.`);

  let fromSession = 0;
  let fromWhatsApp = 0;
  let unknown = 0;

  for (const user of pending) {
    const firstSession = await prisma.session.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { ipAddress: true, userAgent: true },
    });

    if (firstSession?.ipAddress || firstSession?.userAgent) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          signupSource: clientFromUserAgent(firstSession.userAgent),
          signupIp: firstSession.ipAddress,
          signupUserAgent: firstSession.userAgent?.slice(0, 400) ?? null,
        },
      });
      fromSession += 1;
      continue;
    }

    // No session ever created: on this platform that means the account was made
    // through the WhatsApp assistant, which never issues one.
    const channel = await prisma.whatsAppChannel.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (channel) {
      await prisma.user.update({
        where: { id: user.id },
        data: { signupSource: 'whatsapp' },
      });
      fromWhatsApp += 1;
      continue;
    }

    unknown += 1;
  }

  console.log(
    `[backfill] done - ${fromSession} from their first session, ${fromWhatsApp} from WhatsApp, ${unknown} with nothing to go on.`,
  );
}

main()
  .catch((error) => {
    console.error('[backfill] failed:', (error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
