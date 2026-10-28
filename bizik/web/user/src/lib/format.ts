/** Currency symbols for BiZik's supported markets. */
const CURRENCY_SYMBOL: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  EUR: '€',
  GBP: '£',
  GHS: '₵',
  XAF: 'FCFA ',
};

/** The bare symbol for a currency (e.g. "₦", "$", "FCFA"), for input adornments. */
export function currencySymbol(currency: string): string {
  return (CURRENCY_SYMBOL[currency] ?? currency).trim();
}

/**
 * Currency-aware money format: symbol + thousands separators. Defaults to 2
 * decimals (`₦4,820,500.00`); pass `decimals: 0` for clean big display figures
 * (`₦4,820,500`). Terminology across the app is always payer/payee.
 */
export function formatMoney(amount: number, currency: string, decimals: 0 | 2 = 2): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? '';
  const value = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol}${value}`;
}

/** Compact "≈ <converted>" equivalent line shown beneath a primary figure. */
export function approxMoney(amount: number, currency: string): string {
  return `≈ ${formatMoney(amount, currency)}`;
}

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

/**
 * Friendly label for a payment method / provider code, or a free-text line that
 * may contain one - never shows raw underscores (e.g. `MTN_MOBILE_MONEY`).
 */
export function humanizeMethod(value?: string | null): string {
  if (!value) return '';
  return METHOD_LABELS[value.trim().toUpperCase()] ?? value.replace(/_/g, ' ');
}
