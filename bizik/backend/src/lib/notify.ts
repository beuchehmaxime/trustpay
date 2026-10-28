import { config } from '../config/env';
import { codeBox, dataRows, esc, note, p, renderEmail, Tone } from './email-template';
import { sendMail } from './mailer';
import { sendSmsMessage } from './sms';

/**
 * Outbound email/SMS. Email is delivered via SMTP ({@link sendMail}) using the
 * shared modern templates ({@link renderEmail}); SMS is delivered via Twilio
 * ({@link sendSmsMessage}) and logs in development when unconfigured.
 */
export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  await sendMail({
    to,
    subject,
    text: body,
    // `body` is plain text - escape it and keep the line breaks.
    html: renderEmail({
      preheader: body.slice(0, 90),
      heading: subject,
      bodyHtml: p(esc(body).replace(/\n/g, '<br>')),
    }),
  });
}

export async function sendSms(to: string, body: string): Promise<void> {
  await sendSmsMessage(to, body);
}

/** Branded SMS verification code (phone confirmation at signup / login). */
export async function sendSmsCode(to: string, code: string): Promise<void> {
  await sendSmsMessage(
    to,
    `${code} is your BiZik verification code. It expires in ${config.emailCodeTtlMinutes} minutes.`,
  );
}

/** SMS a password-reset link to the account's phone. */
export async function sendPasswordResetSms(to: string, token: string): Promise<void> {
  const link = `${config.appUrl}/reset-password?token=${token}`;
  await sendSmsMessage(
    to,
    `Reset your BiZik password: ${link} (valid ${config.passwordResetTtlMinutes} minutes).`,
  );
}

/** SMS a deal invite to a counterparty entered by phone. */
export async function sendDealInviteSms(opts: {
  to: string;
  inviterName: string;
  dealTitle: string;
  hasAccount: boolean;
}): Promise<void> {
  const tail = opts.hasAccount
    ? 'Open the BiZik app to review and confirm it.'
    : 'Get the BiZik app to accept it and get started.';
  await sendSmsMessage(
    opts.to,
    `${opts.inviterName} invited you to the deal “${opts.dealTitle}” on BiZik. ${tail}`,
  );
}

/** Branded verification code (email confirmation at signup). */
export async function sendEmailCode(to: string, code: string): Promise<void> {
  await sendMail({
    to,
    subject: `${code} is your BiZik verification code`,
    html: renderEmail({
      preheader: `Your BiZik code is ${code} - expires in ${config.emailCodeTtlMinutes} minutes.`,
      heading: 'Confirm your email',
      bodyHtml:
        p('Enter this code in the app to finish setting up your BiZik account:') +
        codeBox(code) +
        note(
          `This code expires in <b>${config.emailCodeTtlMinutes} minutes</b>. If you didn’t request it, you can safely ignore this email.`,
        ),
    }),
    text: `Your BiZik verification code is ${code}. It expires in ${config.emailCodeTtlMinutes} minutes.`,
  });
}

/** Notify a counterparty that they've been invited to a project. */
export async function sendProjectInvite(opts: {
  to: string;
  inviterName: string;
  projectTitle: string;
  hasAccount: boolean;
}): Promise<void> {
  const body =
    p(`<b>${esc(opts.inviterName)}</b> invited you to collaborate on a project on BiZik, where payments are held safely in escrow and released as work is approved.`) +
    dataRows([
      { label: 'Project', value: opts.projectTitle, strong: true },
      { label: 'Invited by', value: opts.inviterName },
    ]) +
    p(
      opts.hasAccount
        ? 'Open BiZik to review the terms and confirm the project.'
        : 'Create a free account with this email address to review the terms and confirm the project.',
    );
  await sendMail({
    to: opts.to,
    subject: `${opts.inviterName} invited you to "${opts.projectTitle}" on BiZik`,
    html: renderEmail({
      preheader: `${opts.inviterName} invited you to “${opts.projectTitle}” on BiZik.`,
      heading: 'You’ve been invited to a project',
      badge: { label: 'Project invite', tone: 'brand' },
      bodyHtml: body,
      button: {
        label: opts.hasAccount ? 'Review & confirm' : 'Create account & confirm',
        href: config.appUrl,
      },
    }),
    text: `${opts.inviterName} invited you to "${opts.projectTitle}" on BiZik. Open ${config.appUrl} to review and confirm.`,
  });
}

/**
 * KYC status notification (SRS FR-KYC-005 - delivered within 5 minutes via
 * email + push + in-app). This is the email channel.
 */
export async function sendKycStatus(opts: {
  to: string | null;
  fullName: string;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  reason?: string;
}): Promise<void> {
  if (!opts.to) return; // no email on file (email is optional in the phone-first model)
  const COPY: Record<string, { title: string; body: string; tone: Tone; badge: string }> = {
    SUBMITTED: {
      title: 'We received your verification',
      body: 'Your documents are in. Most checks complete within a minute - we’ll let you know the moment it’s done.',
      tone: 'brand',
      badge: 'Submitted',
    },
    UNDER_REVIEW: {
      title: 'Your verification is under review',
      body: 'Our compliance team is taking a closer look at your submission. This is usually resolved within 24 hours.',
      tone: 'warning',
      badge: 'Under review',
    },
    APPROVED: {
      title: 'You’re verified',
      body: 'Your identity is confirmed. You can now create projects, fund escrow and get paid on BiZik.',
      tone: 'success',
      badge: 'Verified',
    },
    REJECTED: {
      title: 'We couldn’t verify your identity',
      body: 'Unfortunately your verification didn’t pass this time. You can resubmit with clearer documents.',
      tone: 'danger',
      badge: 'Action needed',
    },
  };
  const c = COPY[opts.status];
  await sendMail({
    to: opts.to,
    subject: `BiZik verification: ${c.title}`,
    html: renderEmail({
      preheader: c.title,
      heading: c.title,
      tone: c.tone,
      badge: { label: c.badge, tone: c.tone },
      bodyHtml:
        p(`Hi ${esc(opts.fullName.split(' ')[0])}, ${c.body}`) +
        (opts.reason ? note(`<b>Reason:</b> ${esc(opts.reason)}`, c.tone) : ''),
      button:
        opts.status === 'APPROVED' || opts.status === 'REJECTED'
          ? { label: opts.status === 'APPROVED' ? 'Open BiZik' : 'Resubmit', href: config.appUrl, tone: c.tone }
          : undefined,
    }),
    text: `${c.title}. ${c.body}${opts.reason ? ` Reason: ${opts.reason}` : ''}`,
  });
}

/**
 * Generic project/escrow activity email sent to both parties when something
 * happens on a project (milestone added/funded/submitted/released, cancellation,
 * dispute, …). Keeps everyone in the loop.
 */
export async function sendProjectNotification(opts: {
  to: string;
  name: string;
  heading: string;
  body: string;
  projectTitle: string;
}): Promise<void> {
  await sendMail({
    to: opts.to,
    subject: `BiZik · ${opts.heading} - ${opts.projectTitle}`,
    html: renderEmail({
      preheader: `${opts.heading} - ${opts.projectTitle}`,
      heading: opts.heading,
      badge: { label: 'Project update', tone: 'brand' },
      bodyHtml:
        p(`Hi ${esc(opts.name.split(' ')[0])}, ${esc(opts.body)}`) +
        dataRows([{ label: 'Project', value: opts.projectTitle, strong: true }]),
      button: { label: 'View project', href: config.appUrl },
    }),
    text: `${opts.heading} (${opts.projectTitle}). ${opts.body}`,
  });
}

/** Wallet receipt - sent when money is added to or withdrawn from a wallet. */
export async function sendWalletReceipt(opts: {
  to: string | null;
  name: string;
  kind: 'deposit' | 'withdrawal';
  amount: string;
  reference: string;
  balanceAfter: string;
  date: string;
  fee?: string;
  method?: string;
}): Promise<void> {
  if (!opts.to) return; // no email on file (email is optional in the phone-first model)
  const isDeposit = opts.kind === 'deposit';
  const heading = isDeposit ? 'Money added to your wallet' : 'Withdrawal processed';
  const rows = [
    { label: 'Transaction ID', value: opts.reference, strong: true },
    { label: 'Type', value: isDeposit ? 'Deposit' : 'Withdrawal' },
    { label: 'Amount', value: opts.amount, strong: true },
    ...(opts.fee ? [{ label: 'Fee', value: opts.fee }] : []),
    ...(opts.method ? [{ label: isDeposit ? 'Funded via' : 'Sent to', value: opts.method }] : []),
    { label: 'New balance', value: opts.balanceAfter, strong: true },
    { label: 'Date', value: opts.date },
  ];
  await sendMail({
    to: opts.to,
    subject: `BiZik receipt · ${isDeposit ? 'Deposit' : 'Withdrawal'} ${opts.amount} (${opts.reference})`,
    html: renderEmail({
      preheader: `${isDeposit ? 'Deposit' : 'Withdrawal'} of ${opts.amount} - ${opts.reference}`,
      heading,
      tone: isDeposit ? 'success' : 'brand',
      badge: { label: isDeposit ? 'Deposit' : 'Withdrawal', tone: isDeposit ? 'success' : 'brand' },
      bodyHtml:
        p(`Hi ${esc(opts.name.split(' ')[0])}, here’s your receipt.`) +
        dataRows(rows) +
        note('Keep this transaction ID for your records.'),
      button: { label: 'Open wallet', href: config.appUrl, tone: isDeposit ? 'success' : 'brand' },
    }),
    text: `${heading}. ${opts.amount} · Ref ${opts.reference} · New balance ${opts.balanceAfter} · ${opts.date}`,
  });
}

/** Alert compliance of a sanctions/PEP hit (SRS FR-KYC-006). */
export async function sendComplianceAlert(opts: {
  userId: string;
  fullName: string;
  result: string;
}): Promise<void> {
  // In production this pages the on-call Compliance Officer + opens a case.
  console.warn(
    `\n[compliance] AML ${opts.result} for user ${opts.userId} (${opts.fullName}) - account frozen, review required\n`,
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${config.appUrl}/reset-password?token=${token}`;
  await sendMail({
    to,
    subject: 'Reset your BiZik password',
    html: renderEmail({
      preheader: 'Reset your BiZik password - link valid for a limited time.',
      heading: 'Reset your password',
      bodyHtml:
        p('We received a request to reset your BiZik password. Tap the button below to choose a new one.') +
        note(
          `This link is valid for <b>${config.passwordResetTtlMinutes} minutes</b>. If you didn’t request a reset, you can safely ignore this email - your password won’t change.`,
        ),
      button: { label: 'Reset password', href: link },
    }),
    text: `Reset your BiZik password (valid ${config.passwordResetTtlMinutes} min): ${link}`,
  });
}

/**
 * Mandatory login MFA code for platform staff (admin console). Every admin,
 * compliance and mediator sign-in must complete this emailed one-time code.
 */
export async function sendAdminMfaCode(to: string, code: string, name: string): Promise<void> {
  await sendMail({
    to,
    subject: `${code} is your BiZik admin sign-in code`,
    html: renderEmail({
      preheader: `Your BiZik admin sign-in code is ${code}.`,
      heading: 'Admin sign-in verification',
      badge: { label: 'Security', tone: 'brand' },
      bodyHtml:
        p(
          `Hi ${name.split(' ')[0]}, use this one-time code to finish signing in to the BiZik admin console:`,
        ) +
        codeBox(code) +
        note(
          `This code expires in <b>${config.otpTtlMinutes} minutes</b>. If you didn’t try to sign in, secure your account and contact your administrator immediately.`,
          'warning',
        ),
    }),
    text: `Your BiZik admin sign-in code is ${code}. It expires in ${config.otpTtlMinutes} minutes. If this wasn't you, contact your administrator.`,
  });
}

/**
 * Weekly digest - a once-a-week summary of the user's project history and
 * transactions, framed to reinforce trust ("your money is protected"). Sent by
 * the scheduled digest broadcast.
 */
export async function sendWeeklyDigest(
  to: string | null,
  name: string,
  stats: {
    firstName: string;
    projectsTotal: number;
    projectsCompleted: number;
    projectsActive: number;
    transactions: number;
    protectedLabel: string;
    homeCurrency: string;
  },
): Promise<void> {
  if (!to) return; // no email on file (email is optional in the phone-first model)
  const first = stats.firstName || name.split(' ')[0] || 'there';
  const rows = [
    { label: 'Projects', value: String(stats.projectsTotal), strong: true },
    { label: 'Completed safely', value: String(stats.projectsCompleted) },
    { label: 'Active now', value: String(stats.projectsActive) },
    { label: 'Transactions', value: String(stats.transactions), strong: true },
    { label: 'Value protected in escrow', value: stats.protectedLabel, strong: true },
  ];
  await sendMail({
    to,
    subject: 'Your week on BiZik - your deals, safe and sound',
    html: renderEmail({
      preheader: `${stats.projectsCompleted} deal(s) completed · ${stats.transactions} transaction(s) - all protected by BiZik escrow.`,
      heading: 'Your week on BiZik',
      badge: { label: 'Your summary', tone: 'brand' },
      bodyHtml:
        p(`Hi ${first}, here's a quick look at your activity on BiZik - and a reminder that every deal you run is protected by escrow until the work is delivered and approved.`) +
        dataRows(rows) +
        note(
          `<b>Your money is always protected.</b> Funds sit safely in escrow and only move when both sides are satisfied - or a fair resolution is reached. Keep building your track record with confidence.`,
          'success',
        ),
      button: { label: 'Open BiZik', href: config.appUrl },
    }),
    text: `Hi ${first}, your BiZik week: ${stats.projectsTotal} projects (${stats.projectsCompleted} completed, ${stats.projectsActive} active), ${stats.transactions} transactions, ${stats.protectedLabel} protected in escrow. Your money is always protected. Open ${config.appUrl}`,
  });
}

export async function sendOtp(to: string, code: string, channel: 'email' | 'sms'): Promise<void> {
  const msg = `Your BiZik verification code is ${code}. It expires in ${config.otpTtlMinutes} minutes.`;
  if (channel === 'sms') {
    await sendSms(to, msg);
    return;
  }
  await sendMail({
    to,
    subject: `${code} is your BiZik security code`,
    html: renderEmail({
      preheader: `Your BiZik security code is ${code}.`,
      heading: 'Your security code',
      bodyHtml:
        p('Use this code to complete your sign-in:') +
        codeBox(code) +
        note(
          `This code expires in <b>${config.otpTtlMinutes} minutes</b>. If you didn’t try to sign in, please secure your account.`,
        ),
    }),
    text: msg,
  });
}
