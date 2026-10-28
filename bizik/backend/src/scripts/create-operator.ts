/**
 * Create (or re-point) a platform operator account from the server.
 *
 * The console has a chicken-and-egg problem on a fresh deployment: operators are
 * created from inside the console, so the FIRST one cannot be. The boot-time
 * bootstrap only promotes an account that already exists, which leaves nobody
 * able to sign in. This script is the way in.
 *
 * It never prints or logs the password, and reads it from the terminal rather
 * than an argument, so it does not end up in shell history or in `ps` output.
 *
 *   docker exec -it bizik-backend node dist/scripts/create-operator.js \
 *     --email you@example.com --name "Your Name"
 *
 * Re-running it on an existing account resets that account's password and role,
 * which is also how you recover a locked-out operator.
 */
import { createInterface } from 'readline';

import { hashPassword } from '../lib/password';
import { PERMISSION_KEYS } from '../lib/permissions';
import { prisma } from '../lib/prisma';

interface Args {
  email: string;
  name?: string;
  role?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    args[key] = next && !next.startsWith('--') ? next : 'true';
  }
  if (!args.email) {
    throw new Error(
      'Usage: node dist/scripts/create-operator.js --email you@example.com [--name "Your Name"] [--role "Super Admin"]',
    );
  }
  return { email: args.email.trim().toLowerCase(), name: args.name, role: args.role };
}

/** Ask for the password without echoing it back to the terminal. */
function askPassword(prompt: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;
  const readline = createInterface({ input, output, terminal: true });
  return new Promise((resolve) => {
    const onData = (chunk: Buffer | string) => {
      // Reprint the prompt with no characters, so nothing is shown as it is typed.
      const text = String(chunk);
      if (text.includes('\n') || text.includes('\r')) return;
      output.write(`\r${prompt}`);
    };
    input.on('data', onData);
    readline.question(prompt, (answer) => {
      input.off('data', onData);
      output.write('\n');
      readline.close();
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // A password may come from the environment for automated setups, but the
  // terminal prompt is the default: an argument would be world-readable in `ps`.
  const fromEnv = process.env.OPERATOR_PASSWORD;
  const password = fromEnv ?? (await askPassword('New operator password (hidden): '));
  if (password.length < 12) {
    throw new Error('Choose a password of at least 12 characters - this account can move money.');
  }
  if (!fromEnv) {
    const confirmation = await askPassword('Repeat it: ');
    if (confirmation !== password) throw new Error('The two passwords do not match.');
  }

  // The role: a named one, or the platform's super-admin role (created here if
  // this is a brand-new database and the app has not booted yet).
  const role = args.role
    ? await prisma.adminRole.findFirst({ where: { name: args.role } })
    : ((await prisma.adminRole.findFirst({ where: { isSuperAdmin: true } })) ??
      (await prisma.adminRole.create({
        data: {
          name: 'Super Admin',
          description: 'Full, unrestricted access to every part of the platform.',
          isSuperAdmin: true,
          isSystem: true,
          permissions: PERMISSION_KEYS,
        },
      })));
  if (!role) throw new Error(`No admin role named "${args.role}". Create it in the console first.`);

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email: args.email } });
  const user = await prisma.user.upsert({
    where: { email: args.email },
    update: {
      passwordHash,
      adminRoleId: role.id,
      role: 'ADMIN',
      status: 'ACTIVE',
      // Staff sign-in codes go to this address, so it counts as proven once an
      // operator with server access has set it here.
      emailVerified: true,
      ...(args.name ? { fullName: args.name } : {}),
    },
    create: {
      email: args.email,
      fullName: args.name ?? args.email.split('@')[0],
      passwordHash,
      adminRoleId: role.id,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  console.log(
    `${existing ? 'Updated' : 'Created'} operator ${user.email} (${user.fullName}) with role "${role.name}".`,
  );
  console.log('Sign in at the admin console; a one-time code is emailed to that address.');
}

main()
  .catch((error: Error) => {
    console.error(`[create-operator] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
