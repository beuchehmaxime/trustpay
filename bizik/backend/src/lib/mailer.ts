import nodemailer, { Transporter } from 'nodemailer';

import { config } from '../config/env';

/**
 * SMTP transport (SendGrid / generic SMTP per env). Created lazily and reused.
 * Port 465 implies an implicit TLS connection (`secure: true`).
 */
let transporter: Transporter | null = null;

/**
 * Subjects carry one-time codes ("123456 is your BiZik admin sign-in code"), so
 * they must never reach the logs: anyone able to read container output could
 * replay a live staff MFA code. Recipients are masked for the same reason.
 */
function maskEmail(address: string): string {
  const [name = '', domain = ''] = address.split('@');
  const head = name.slice(0, 2);
  return `${head}${name.length > 2 ? '***' : ''}@${domain}`;
}

function getTransport(): Transporter | null {
  if (!config.email.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      // 465 = implicit TLS; 587 = STARTTLS (upgrade the plaintext connection).
      secure: config.email.port === 465,
      requireTLS: config.email.port === 587,
      auth: config.email.user
        ? { user: config.email.user, pass: config.email.pass }
        : undefined,
      // Fail fast if the SMTP server is slow/unreachable so a background send
      // can't hang (the request flow no longer waits on email anyway).
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }
  return transporter;
}

/**
 * Send a transactional email. If SMTP isn't configured (or the send fails) we
 * log and resolve so the calling flow never crashes on email issues - the code
 * still lives in Redis and can be re-requested.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const t = getTransport();
  const from = `${config.email.fromName} <${config.email.fromEmail}>`;
  if (!t) {
    console.log(`[mailer] (disabled) would send to ${maskEmail(opts.to)}`);
    return;
  }
  try {
    await t.sendMail({ from, ...opts });
    console.log(`[mailer] sent to ${maskEmail(opts.to)}`);
  } catch (err) {
    console.error(`[mailer] failed to send to ${maskEmail(opts.to)}:`, (err as Error).message);
  }
}
