import { describe, expect, it } from 'vitest';

import { buildReceiptPdf, type ReceiptData } from './receipt-pdf';

const sample: ReceiptData = {
  title: 'Withdrawal',
  reference: 'QTQ-2026-000123',
  dateLabel: '13 August 2026, 14:05',
  amount: -25000,
  currency: 'XAF',
  method: 'MTN MoMo',
  statusLabel: 'Completed',
};

describe('buildReceiptPdf', () => {
  it('returns a non-empty Uint8Array of PDF bytes', async () => {
    const bytes = await buildReceiptPdf(sample);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('starts with the %PDF magic header', async () => {
    const bytes = await buildReceiptPdf(sample);
    const header = Buffer.from(bytes.subarray(0, 5)).toString('latin1');
    expect(header).toBe('%PDF-');
  });

  it('renders an incoming (positive) amount without a method line too', async () => {
    const bytes = await buildReceiptPdf({
      ...sample,
      amount: 15000,
      method: null,
    });
    expect(bytes.length).toBeGreaterThan(0);
    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  });
});
