/**
 * Human-friendly labels for payment method / provider / gateway codes so raw
 * enum values like `MTN_MOBILE_MONEY` never reach the user with underscores.
 * Known codes get a proper label; anything else just has its underscores
 * replaced with spaces.
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
  const key = value.trim().toUpperCase();
  return METHOD_LABELS[key] ?? value.replace(/_/g, ' ');
}
