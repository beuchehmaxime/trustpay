/**
 * Human-friendly labels for payment method / provider / gateway codes so raw
 * enum values like `MTN_MOBILE_MONEY` or `INTERNAL` never show underscores.
 */
const METHOD_LABELS: Record<string, string> = {
  MTN_MOBILE_MONEY: 'MTN Mobile Money',
  MTN_MOMO: 'MTN Mobile Money',
  ORANGE_MONEY: 'Orange Money',
  ORANGE_MOMO: 'Orange Money',
  BANK: 'Bank transfer',
  BANK_TRANSFER: 'Bank transfer',
  PAYONEER: 'Payoneer',
  INTERNAL: 'Internal',
  SIMULATED: 'Simulated',
  WALLET: 'Wallet',
};

export function humanizeMethod(value?: string | null): string {
  if (!value) return '';
  return METHOD_LABELS[value.trim().toUpperCase()] ?? value.replace(/_/g, ' ');
}
