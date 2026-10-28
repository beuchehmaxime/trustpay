/**
 * Send one SMS to a number you control, to prove the rail actually works.
 *
 * Testing through the app is awkward: a password reset needs an account with
 * that number, and it returns success whether or not anything was sent (on
 * purpose - otherwise anyone could discover which numbers are registered). So
 * "nothing arrived" could mean a broken rail, a number with no account, or a
 * throttle, and the three looked identical.
 *
 * This bypasses all of that and reports exactly what the provider said. It is
 * the first thing to run after configuring Orange or Twilio, and the honest
 * answer to "is SMS working?".
 *
 * Note it spends one unit of the prepaid Orange bundle.
 *
 * Run inside the backend container:
 *   node dist/scripts/send-test-sms.js +237650035675
 *   node dist/scripts/send-test-sms.js +237650035675 twilio
 *
 * The second argument forces one rail. That is how you tell "our code is
 * broken" apart from "this provider's account is not delivering": if the other
 * rail lands on the same handset, everything up to the provider works and the
 * fault is on the silent provider's side, not here.
 */
import { config } from '../config/env';
import { orangeSms, sendSmsMessage, smsProviderStatus, twilioSms } from '../lib/sms';
import { maskNumber } from '../lib/sms-providers/types';
import { normalizePhone } from '../lib/phone';

async function main() {
  const rawNumber = process.argv[2];
  if (!rawNumber) {
    console.error('Usage: node dist/scripts/send-test-sms.js <+phone> [orange|twilio]');
    process.exitCode = 1;
    return;
  }
  const phone = normalizePhone(rawNumber);

  // Force a rail for this run only, without touching the deployed config.
  const forced = (process.argv[3] ?? '').toLowerCase();
  if (forced) {
    if (forced !== 'orange' && forced !== 'twilio') {
      console.error(`Unknown rail "${forced}". Use "orange" or "twilio".`);
      process.exitCode = 1;
      return;
    }
    (config as { smsProvider: string }).smsProvider = forced;
    console.log(`(forcing ${forced} for this send only)
`);
  }

  console.log('--- rails ---');
  for (const rail of smsProviderStatus()) {
    console.log(
      `  ${rail.name}: ${rail.configured ? 'configured' : 'NOT configured'}` +
        `${rail.preferred ? ' (preferred for this number)' : ''}`,
    );
  }
  if (orangeSms.isConfigured()) {
    console.log(
      `  orange sender=${config.orangeSms.senderAddress}` +
        ` name=${config.orangeSms.senderName || '(account default)'}`,
    );
    try {
      for (const contract of await orangeSms.balance()) {
        console.log(
          `  orange bundle ${contract.country} (${contract.offerName}):` +
            ` ${contract.availableUnits} units, ${contract.status}`,
        );
      }
    } catch (error) {
      console.warn(`  orange bundle unreadable: ${(error as Error).message}`);
    }
  }
  if (!orangeSms.isConfigured() && !twilioSms.isConfigured()) {
    console.error('\nNo SMS rail is configured, so nothing can be sent.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n--- sending to ${maskNumber(phone)} ---`);
  // `sendSmsMessage` never throws (a failed code must not break a request), so
  // the outcome is in the log lines it writes, not in a return value.
  await sendSmsMessage(
    phone,
    'BiZik test message. If you are reading this, SMS delivery is working. No action needed.',
  );

  console.log(
    '\nA line above starting "[sms] sent to" means the provider ACCEPTED it.\n' +
      'That is not proof it arrived: Orange answers 201 on acceptance, and a\n' +
      'sender name that is not whitelisted with the recipient\'s operator is\n' +
      'dropped silently afterwards. Delivery receipts are what confirm arrival,\n' +
      'so register the callback URL with Orange if you have not:\n' +
      '  https://api.bizik.cm/api/v1/sms/webhooks/orange/dr',
  );
}

main()
  .catch((error) => {
    console.error('[test-sms] failed:', (error as Error).message);
    process.exitCode = 1;
  })
  // The Orange provider spaces sends on a timer; give it a moment to settle
  // before the process exits, or a queued send is cut off mid-flight.
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 1500));
