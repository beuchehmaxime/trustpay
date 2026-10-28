/**
 * Modern, email-client-safe HTML templates for all BiZik transactional email.
 *
 * Built with table layout + inline styles (the only reliable way across Gmail,
 * Outlook, Apple Mail, etc.). Compose the inner content with the exported block
 * helpers (`p`, `codeBox`, `dataRows`, `note`, `badge`) and pass it to
 * {@link renderEmail}, which wraps it in the branded shell.
 */
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const C = {
  page: '#EEF2F7',
  card: '#FFFFFF',
  ink: '#16263F',
  body: '#475569',
  muted: '#94A3B8',
  brand: '#2563EB',
  hairline: '#E7ECF3',
};

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'muted';

const TONE: Record<Tone, { bg: string; fg: string; strip: string }> = {
  brand: { bg: '#EFF6FF', fg: '#2563EB', strip: '#3B82F6' },
  success: { bg: '#DCFCE7', fg: '#16A34A', strip: '#16A34A' },
  warning: { bg: '#FEF3C7', fg: '#D97706', strip: '#F59E0B' },
  danger: { bg: '#FEE2E2', fg: '#DC2626', strip: '#EF4444' },
  muted: { bg: '#F1F5F9', fg: '#64748B', strip: '#94A3B8' },
};

/**
 * Escape text that goes into an email. Values here reach real inboxes from a
 * domain that passes SPF/DKIM, so an unescaped name or subject could plant a
 * working link in an otherwise genuine BiZik email. Every leaf that receives
 * plain text escapes it; `p()` and `note()` still take markup, so their callers
 * escape the values they interpolate.
 */
export function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) and mailto links may appear in a button. */
function safeHref(href: string): string {
  return /^(https?:|mailto:)/i.test(href) ? esc(href) : '#';
}

// ---- Block helpers (compose into `bodyHtml`) ------------------------------

/** A body paragraph. */
export function p(html: string): string {
  return `<p style="margin:0 0 14px;color:${C.body};font-size:15px;line-height:23px;font-family:${FONT};">${html}</p>`;
}

/** A big, centered code (verification / OTP). */
export function codeBox(code: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 0 18px;">
    <div style="background:${TONE.brand.bg};border:1px solid #DBEAFE;border-radius:14px;padding:20px;text-align:center;">
      <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:${C.brand};font-family:${FONT};">${esc(code)}</div>
    </div>
  </td></tr></table>`;
}

/** Key/value rows (project details, amounts, …). */
export function dataRows(items: { label: string; value: string; strong?: boolean }[]): string {
  const rows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:9px 0;color:${C.muted};font-size:13px;border-bottom:1px solid ${C.hairline};font-family:${FONT};">${esc(it.label)}</td>
        <td align="right" style="padding:9px 0;color:${C.ink};font-size:14px;font-weight:${it.strong ? 700 : 600};border-bottom:1px solid ${C.hairline};font-family:${FONT};">${esc(it.value)}</td>
      </tr>`,
    )
    .join('');
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;background:#F8FAFC;border:1px solid ${C.hairline};border-radius:14px;padding:6px 16px;">
    ${rows}
  </table>`;
}

/** A subtle highlighted note (reasons, security tips). */
export function note(html: string, tone: Tone = 'muted'): string {
  const t = TONE[tone];
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:2px 0 16px;">
    <div style="background:${t.bg};border-radius:12px;padding:14px 16px;color:${t.fg};font-size:13px;line-height:20px;font-family:${FONT};">${html}</div>
  </td></tr></table>`;
}

/** A rounded status pill. */
export function badge(label: string, tone: Tone = 'brand'): string {
  const t = TONE[tone];
  return `<span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${t.bg};color:${t.fg};font-size:12px;font-weight:700;font-family:${FONT};letter-spacing:0.2px;">${esc(label)}</span>`;
}

// ---- Shell ----------------------------------------------------------------

export interface RenderEmailOpts {
  /** Hidden inbox-preview line. */
  preheader: string;
  heading: string;
  /** Pre-built inner HTML (use the block helpers above). */
  bodyHtml: string;
  /** Optional badge shown above the heading. */
  badge?: { label: string; tone: Tone };
  /** Optional primary call-to-action button. */
  button?: { label: string; href: string; tone?: Tone };
  /** Accent strip + theme colour. */
  tone?: Tone;
  /** Extra muted line in the footer. */
  footerNote?: string;
}

function buttonHtml(label: string, href: string, tone: Tone): string {
  const color = TONE[tone].fg === '#2563EB' ? C.brand : TONE[tone].fg;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px auto 8px;"><tr>
    <td align="center" bgcolor="${color}" style="border-radius:12px;">
      <a href="${safeHref(href)}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;font-family:${FONT};">${esc(label)}</a>
    </td>
  </tr></table>`;
}

export function renderEmail(opts: RenderEmailOpts): string {
  const tone = opts.tone ?? 'brand';
  const badgeHtml = opts.badge ? `<div style="margin:0 0 12px;">${badge(opts.badge.label, opts.badge.tone)}</div>` : '';
  const cta = opts.button ? buttonHtml(opts.button.label, opts.button.href, opts.button.tone ?? tone) : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${esc(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
        <tr><td style="padding:4px 4px 20px;text-align:center;">
          <span style="font-size:25px;font-weight:800;color:${C.brand};letter-spacing:-0.6px;font-family:${FONT};">BiZik</span>
        </td></tr>
        <tr><td style="background:${C.card};border-radius:20px;overflow:hidden;">
          <div style="padding:32px 28px 28px;">
            ${badgeHtml}
            <h1 style="margin:0 0 14px;color:${C.ink};font-size:21px;line-height:28px;font-weight:800;font-family:${FONT};">${esc(opts.heading)}</h1>
            ${opts.bodyHtml}
            ${cta}
          </div>
        </td></tr>
        <tr><td style="padding:22px 18px 8px;text-align:center;color:${C.muted};font-size:12px;line-height:19px;font-family:${FONT};">
          ${opts.footerNote ? `${opts.footerNote}<br><br>` : ''}
          © BiZik · Secure escrow for freelancers &amp; clients.<br>
          You’re receiving this because you have a BiZik account.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
