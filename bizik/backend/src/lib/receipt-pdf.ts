import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

import { Currency } from '@prisma/client';

import { humanizeMethod } from './method-format';
import { INTER_BOLD_B64, INTER_SEMIBOLD_B64 } from './fonts/inter';

export interface ReceiptData {
  title: string;
  reference: string;
  dateLabel: string;
  /** Signed amount (negative = money out). */
  amount: number;
  currency: Currency;
  method?: string | null;
  statusLabel: string;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  XAF: 'FCFA',
  USD: '$',
  EUR: '€',
  GBP: '£',
  NGN: '₦',
  GHS: 'GH₵',
};

function formatMoney(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency;
  const grouped = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${grouped}`;
}

// ---- Palette --------------------------------------------------------------
const BRAND = rgb(0.145, 0.388, 0.922); // #2563EB - wordmark, title, labels
const SECONDARY = rgb(0.055, 0.612, 0.753); // #0E9CC0 - brand secondary, used for values
const MUTED = rgb(0.42, 0.447, 0.502); // #6B7280 - subtitle / footer
const HAIRLINE = rgb(0.89, 0.906, 0.933); // #E3E7EE - row separators
const POSITIVE = rgb(0.086, 0.639, 0.29); // #16A34A
const AMBER = rgb(0.792, 0.4, 0.03); // #CA6608
const NEGATIVE = rgb(0.882, 0.114, 0.282); // #E11D48

/** Colour the status value by its meaning (falls back to the secondary tone). */
function statusColor(label: string): ReturnType<typeof rgb> {
  const value = label.toLowerCase();
  if (value.includes('complet') || value.includes('success') || value.includes('settl')) {
    return POSITIVE;
  }
  if (value.includes('pend') || value.includes('process') || value.includes('hold')) return AMBER;
  if (value.includes('fail') || value.includes('revers') || value.includes('cancel')) {
    return NEGATIVE;
  }
  return SECONDARY;
}

function drawCentered(
  page: PDFPage,
  text: string,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  pageWidth: number,
): void {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (pageWidth - width) / 2, y, size, font, color });
}

/** One line of a deal document: a milestone with its own amount and state. */
export interface DealReceiptLine {
  title: string;
  amount: number;
  statusLabel: string;
  dueDate?: string | null;
}

export interface DealReceiptData {
  /** The deal reference (QTQ-…), which is also the document number. */
  reference: string;
  title: string;
  statusLabel: string;
  createdLabel: string;
  currency: Currency;
  payerName: string;
  payeeName: string;
  /** Whether the reader is the one paying - the document is addressed to them. */
  viewerIsPayer: boolean;
  lines: DealReceiptLine[];
  subtotal: number;
  fee: number;
  /** Subtotal + fee for a payer; subtotal - fee for a payee. */
  total: number;
  feeLabel: string;
  totalLabel: string;
  releasedToDate: number;
  heldInEscrow: number;
}

/**
 * The document a party can hand to their accountant: what the deal is, who the
 * parties are, every milestone, and what it costs. Deliberately NOT called an
 * invoice in the data model - an invoice is a demand for payment from a seller,
 * while a deal is a two-sided agreement - but it is the artefact people mean
 * when they ask for one, so the title adapts to which side is reading it.
 */
export async function buildDealReceiptPdf(data: DealReceiptData): Promise<Uint8Array> {
  const W = 520;
  const M = 44;
  const lineH = 26;
  // Grow the page with the number of milestones so nothing is ever clipped.
  const H = Math.max(660, 470 + data.lines.length * lineH);

  const doc = await PDFDocument.create();
  doc.setTitle(`BiZik ${data.reference}`);
  doc.setCreator('BiZik');
  doc.registerFontkit(fontkit);
  const page = doc.addPage([W, H]);
  const body = await doc.embedFont(Buffer.from(INTER_SEMIBOLD_B64, 'base64'));
  const bold = await doc.embedFont(Buffer.from(INTER_BOLD_B64, 'base64'));

  // ---- Header ----
  page.drawText('BiZik', { x: M, y: H - 56, size: 20, font: bold, color: BRAND });
  const tagline = 'secure escrow';
  const taglineWidth = body.widthOfTextAtSize(tagline, 10);
  page.drawText(tagline, { x: W - M - taglineWidth, y: H - 54, size: 10, font: body, color: MUTED });

  const heading = data.viewerIsPayer ? 'Payment Record' : 'Earnings Record';
  drawCentered(page, heading, H - 104, 21, bold, BRAND, W);
  drawCentered(page, `Deal ${data.reference}`, H - 124, 10, body, MUTED, W);

  // ---- Parties + status ----
  let cursor = H - 158;
  const meta: { label: string; value: string; color?: ReturnType<typeof rgb> }[] = [
    { label: 'Deal', value: data.title },
    { label: 'Paid by', value: data.payerName },
    { label: 'Paid to', value: data.payeeName },
    { label: 'Created', value: data.createdLabel },
    { label: 'Status', value: data.statusLabel, color: statusColor(data.statusLabel) },
  ];
  meta.forEach((row) => {
    page.drawText(row.label, { x: M + 2, y: cursor, size: 11, font: bold, color: BRAND });
    page.drawText(row.value, {
      x: M + 150,
      y: cursor,
      size: 11,
      font: body,
      color: row.color ?? SECONDARY,
    });
    cursor -= 22;
  });

  // ---- Milestone table ----
  cursor -= 10;
  page.drawLine({ start: { x: M, y: cursor }, end: { x: W - M, y: cursor }, thickness: 1, color: HAIRLINE });
  cursor -= 18;
  page.drawText('ITEM', { x: M + 2, y: cursor, size: 9, font: bold, color: MUTED });
  page.drawText('STATUS', { x: M + 250, y: cursor, size: 9, font: bold, color: MUTED });
  page.drawText('AMOUNT', { x: W - M - 90, y: cursor, size: 9, font: bold, color: MUTED });
  cursor -= 10;
  page.drawLine({ start: { x: M, y: cursor }, end: { x: W - M, y: cursor }, thickness: 1, color: HAIRLINE });

  data.lines.forEach((line) => {
    cursor -= lineH;
    const label = line.title.length > 34 ? `${line.title.slice(0, 33)}…` : line.title;
    page.drawText(label, { x: M + 2, y: cursor, size: 10.5, font: body, color: BRAND });
    page.drawText(line.statusLabel, {
      x: M + 250,
      y: cursor,
      size: 10.5,
      font: body,
      color: statusColor(line.statusLabel),
    });
    const amount = formatMoney(line.amount, data.currency);
    const amountWidth = body.widthOfTextAtSize(amount, 10.5);
    page.drawText(amount, { x: W - M - amountWidth, y: cursor, size: 10.5, font: body, color: SECONDARY });
  });

  // ---- Totals ----
  cursor -= 16;
  page.drawLine({ start: { x: M, y: cursor }, end: { x: W - M, y: cursor }, thickness: 1, color: HAIRLINE });
  const totals: { label: string; value: number; strong?: boolean }[] = [
    { label: 'Subtotal', value: data.subtotal },
    { label: data.feeLabel, value: data.fee },
    { label: data.totalLabel, value: data.total, strong: true },
  ];
  totals.forEach((row) => {
    cursor -= 24;
    page.drawText(row.label, {
      x: M + 2,
      y: cursor,
      size: row.strong ? 12 : 11,
      font: bold,
      color: BRAND,
    });
    const value = formatMoney(row.value, data.currency);
    const valueWidth = (row.strong ? bold : body).widthOfTextAtSize(value, row.strong ? 12 : 11);
    page.drawText(value, {
      x: W - M - valueWidth,
      y: cursor,
      size: row.strong ? 12 : 11,
      font: row.strong ? bold : body,
      color: row.strong ? BRAND : SECONDARY,
    });
  });

  // ---- Escrow position ----
  cursor -= 34;
  page.drawText('Released to date', { x: M + 2, y: cursor, size: 10, font: bold, color: MUTED });
  const released = formatMoney(data.releasedToDate, data.currency);
  page.drawText(released, {
    x: W - M - body.widthOfTextAtSize(released, 10),
    y: cursor,
    size: 10,
    font: body,
    color: POSITIVE,
  });
  cursor -= 18;
  page.drawText('Still held in escrow', { x: M + 2, y: cursor, size: 10, font: bold, color: MUTED });
  const held = formatMoney(data.heldInEscrow, data.currency);
  page.drawText(held, {
    x: W - M - body.widthOfTextAtSize(held, 10),
    y: cursor,
    size: 10,
    font: body,
    color: AMBER,
  });

  drawCentered(
    page,
    'BiZik holds the money until the delivery is approved.',
    40,
    9,
    body,
    MUTED,
    W,
  );

  return doc.save();
}

/** Render a BiZik transaction receipt in a clean, bank-style layout (Inter). */
export async function buildReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const W = 460;
  const H = 640;
  const M = 44;
  const labelX = M + 2;
  const valueX = M + 168;

  const doc = await PDFDocument.create();
  doc.setTitle(`BiZik receipt ${data.reference}`);
  doc.setCreator('BiZik');
  doc.registerFontkit(fontkit);
  const page = doc.addPage([W, H]);
  // Inter SemiBold for body/values ("a bit bolder"), Inter Bold for labels/heads.
  // NB: embed the FULL font (not subset) - pdf-lib's subsetter mangles Inter's
  // glyph mapping, which drops/scrambles most characters.
  const body = await doc.embedFont(Buffer.from(INTER_SEMIBOLD_B64, 'base64'));
  const bold = await doc.embedFont(Buffer.from(INTER_BOLD_B64, 'base64'));

  // ---- Header: wordmark + tagline, centred title, subtitle ----
  page.drawText('BiZik', { x: M, y: H - 56, size: 20, font: bold, color: BRAND });
  const tagline = 'secure escrow';
  const taglineWidth = body.widthOfTextAtSize(tagline, 10);
  page.drawText(tagline, { x: W - M - taglineWidth, y: H - 54, size: 10, font: body, color: MUTED });
  page.drawLine({
    start: { x: W - M - taglineWidth - 16, y: H - 60 },
    end: { x: W - M - taglineWidth - 6, y: H - 44 },
    thickness: 3,
    color: BRAND,
  });

  drawCentered(page, 'Transaction Receipt', H - 104, 21, bold, BRAND, W);
  drawCentered(page, 'BiZik · secure escrow for everyone', H - 126, 10, body, MUTED, W);

  // ---- Rows ----
  const rows: { label: string; value: string; color?: ReturnType<typeof rgb> }[] = [
    { label: 'Transaction Amount', value: formatMoney(data.amount, data.currency) },
    { label: 'Transaction Type', value: data.title },
    { label: 'Transaction Date', value: data.dateLabel },
  ];
  if (data.method) rows.push({ label: 'Method', value: humanizeMethod(data.method) });
  rows.push({ label: 'Transaction Reference', value: data.reference });
  rows.push({ label: 'Transaction Status', value: data.statusLabel, color: statusColor(data.statusLabel) });

  const rowH = 42;
  const tableTop = H - 158;
  page.drawLine({
    start: { x: M, y: tableTop },
    end: { x: W - M, y: tableTop },
    thickness: 1,
    color: HAIRLINE,
  });
  rows.forEach((row, index) => {
    const topLine = tableTop - index * rowH;
    const baseline = topLine - rowH / 2 - 4;
    // Left labels: BOLD, brand blue. Right values: SemiBold, secondary (or status) colour.
    page.drawText(row.label, { x: labelX, y: baseline, size: 11, font: bold, color: BRAND });
    page.drawText(row.value, {
      x: valueX,
      y: baseline,
      size: 11,
      font: body,
      color: row.color ?? SECONDARY,
    });
    page.drawLine({
      start: { x: M, y: topLine - rowH },
      end: { x: W - M, y: topLine - rowH },
      thickness: 1,
      color: HAIRLINE,
    });
  });

  // ---- Footer ----
  const footerTop = tableTop - rows.length * rowH - 40;
  drawCentered(page, 'Thank you for using BiZik.', footerTop, 10.5, bold, MUTED, W);
  drawCentered(page, 'Questions? Contact support@bizik.cm', footerTop - 18, 9.5, body, MUTED, W);
  drawCentered(page, 'BiZik · App · Web · Escrow · Support', footerTop - 34, 9, body, MUTED, W);

  return doc.save();
}
