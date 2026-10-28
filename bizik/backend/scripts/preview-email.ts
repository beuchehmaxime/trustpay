import * as fs from 'fs';
import * as path from 'path';
import { renderEmail, p, codeBox, dataRows, note } from '../src/lib/email-template';

const out = path.join(__dirname, '..', 'email-previews');
fs.mkdirSync(out, { recursive: true });
const samples: Record<string, string> = {
  'verification-code': renderEmail({ preheader: 'code', heading: 'Confirm your email', bodyHtml: p('Enter this code in the app to finish setting up your BiZik account:') + codeBox('7164') + note('This code expires in <b>10 minutes</b>. If you didn’t request it, you can safely ignore this email.') }),
  'project-invite': renderEmail({ preheader: 'invite', heading: 'You’ve been invited to a project', badge: { label: 'Project invite', tone: 'brand' }, bodyHtml: p('<b>Beucheh Maxime</b> invited you to collaborate on a project on BiZik, where payments are held safely in escrow and released as work is approved.') + dataRows([{ label: 'Project', value: 'Brand website design', strong: true }, { label: 'Invited by', value: 'Beucheh Maxime' }]) + p('Create a free account with this email to review and confirm.'), button: { label: 'Create account & confirm', href: 'https://app.bizik.cm' } }),
  'kyc-approved': renderEmail({ preheader: 'verified', heading: 'You’re verified', tone: 'success', badge: { label: 'Verified', tone: 'success' }, bodyHtml: p('Hi Amara, your identity is confirmed. You can now create projects, fund escrow and get paid on BiZik.'), button: { label: 'Open BiZik', href: 'https://app.bizik.cm', tone: 'success' } }),
  'kyc-rejected': renderEmail({ preheader: 'rejected', heading: 'We couldn’t verify your identity', tone: 'danger', badge: { label: 'Action needed', tone: 'danger' }, bodyHtml: p('Hi Amara, unfortunately your verification didn’t pass this time.') + note('<b>Reason:</b> ID photo was blurry.', 'danger'), button: { label: 'Resubmit', href: 'https://app.bizik.cm', tone: 'danger' } }),
  'project-update': renderEmail({ preheader: 'update', heading: 'Payment released', badge: { label: 'Project update', tone: 'brand' }, bodyHtml: p('Hi Amara, FCFA 487.50 was released for “Phase 1”.') + dataRows([{ label: 'Project', value: 'Brand website design', strong: true }]), button: { label: 'View project', href: 'https://app.bizik.cm' } }),
  'password-reset': renderEmail({ preheader: 'reset', heading: 'Reset your password', bodyHtml: p('We received a request to reset your BiZik password. Tap the button below to choose a new one.') + note('This link is valid for <b>60 minutes</b>. If you didn’t request a reset, ignore this email.'), button: { label: 'Reset password', href: 'https://app.bizik.cm/reset-password?token=abc' } }),
};
const index = ['<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;padding:20px;background:#eee"><h2>BiZik email previews</h2><ul>'];
for (const [name, html] of Object.entries(samples)) {
  fs.writeFileSync(path.join(out, name + '.html'), html);
  index.push(`<li><a href="./${name}.html">${name}</a></li>`);
}
index.push('</ul>');
fs.writeFileSync(path.join(out, 'index.html'), index.join(''));
console.log('Wrote ' + (Object.keys(samples).length) + ' previews to: ' + out);
