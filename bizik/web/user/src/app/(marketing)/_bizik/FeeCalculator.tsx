import type { getTranslator } from './i18n';
import { formatPct, type PublicFees } from './data';

const CURRENCIES = ['XAF', 'USD', 'EUR', 'GBP', 'NGN', 'GHS'];

/**
 * The interactive fee calculator (homepage and pricing page). Rates come from
 * the live fee settings; Scripts.tsx does the arithmetic in the browser. The
 * buyer pays the escrow fee on top of the amount and the seller's fee (zero
 * today) is deducted on release - there is no "who pays" choice to offer.
 */
export function FeeCalculator({
  fees,
  lang,
  t,
}: {
  fees: PublicFees;
  lang: string;
  t: ReturnType<typeof getTranslator>;
}) {
  return (
    <div className="q-calc" data-qatiqa-calc data-fee-client={fees.buyerPct} data-fee-seller={fees.sellerPct}>
      <label className="q-calc__label" htmlFor="q-calc-amount">{t('home.calc.amountLabel')}</label>
      <div className="q-calc__controls">
        <input type="number" id="q-calc-amount" data-calc-amount defaultValue={450000} min={0} step={1000} inputMode="numeric" />
        <select data-calc-currency aria-label={t('home.calc.currencyAria')} defaultValue="XAF">
          {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
        </select>
      </div>
      <div className="q-calc__rows">
        <div className="q-calc__row">
          <span>{t('home.calc.rowFee', { pct: formatPct(fees.buyerPct, lang) })}</span>
          <span data-calc-fee>-</span>
        </div>
        <div className="q-calc__row"><span>{t('home.calc.rowBuyer')}</span><span data-calc-buyer>-</span></div>
        <div className="q-calc__row q-calc__row--total"><span>{t('home.calc.rowSeller')}</span><span data-calc-seller>-</span></div>
      </div>
    </div>
  );
}
