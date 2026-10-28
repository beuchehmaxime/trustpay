import { config } from '../../config/env';
import { PaymentProviderName } from '../domain/payment.types';
import {
  CollectionProvider,
  DisbursementProvider,
  PaymentStatusProvider,
  WebhookParsingProvider,
} from '../domain/provider.interfaces';
import { BankPaymentProvider } from '../infrastructure/banks/bank-payment-provider';
import { FapshiPaymentProvider } from '../infrastructure/fapshi/fapshi-payment-provider';
import { MtnPaymentProvider } from '../infrastructure/mtn/mtn-payment-provider';
import { OrangePaymentProvider } from '../infrastructure/orange/orange-payment-provider';
import { SimulatedPaymentProvider } from '../infrastructure/simulated/simulated-payment-provider';

/**
 * Chooses the concrete adapter for a given provider + capability. A real adapter
 * is used only when `PAYMENTS_MODE=live` AND that provider is fully configured;
 * otherwise the simulator (tagged with the requested provider name) handles it,
 * so development and partially-onboarded providers keep working end-to-end.
 *
 * Business services depend on the capability INTERFACES this returns - never on
 * a concrete provider (Dependency Inversion).
 */
class PaymentProviderFactoryImpl {
  private readonly mtn = new MtnPaymentProvider();
  private readonly orange = new OrangePaymentProvider();
  private readonly bank = new BankPaymentProvider();
  /**
   * Fapshi aggregator - currently the active rail for ALL mobile money (MTN +
   * Orange) collection and disbursement in Cameroon. The direct MTN/Orange
   * adapters are kept for later; momo just routes through Fapshi for now.
   */
  private readonly fapshi = new FapshiPaymentProvider();
  private readonly simulated = new Map<PaymentProviderName, SimulatedPaymentProvider>();

  /**
   * The simulator reports success without moving money. In live mode that is
   * indistinguishable from a real payout to the user and to our own records, so
   * asking for it on a money-out path is a configuration error, not a fallback.
   */
  private refuseSimulatedPayout(providerName: PaymentProviderName): never {
    throw new Error(
      `No live disbursement rail for ${providerName}. Refusing to simulate a payout in live mode.`,
    );
  }

  /**
   * The simulator reports a collection SUCCESSFUL without anyone paying, and
   * answers SUCCESSFUL to a status query for any reference at all. In live mode
   * that is free money: a deposit routed to it credits a real wallet. It also
   * voids the webhook defence, which relies on re-querying a real provider.
   */
  private refuseSimulatedCollection(providerName: PaymentProviderName): never {
    throw new Error(
      `No live collection rail for ${providerName}. Refusing to credit a wallet from the simulator in live mode.`,
    );
  }

  private simulatedFor(providerName: PaymentProviderName): SimulatedPaymentProvider {
    let provider = this.simulated.get(providerName);
    if (!provider) {
      provider = new SimulatedPaymentProvider(providerName);
      this.simulated.set(providerName, provider);
    }
    return provider;
  }

  private useReal(adapter: { isConfigured(): boolean }): boolean {
    return config.payments.mode === 'live' && adapter.isConfigured();
  }

  /** Human-readable summary of which providers are live vs simulated (startup log). */
  describe(): string {
    const state = (label: string, adapter: { isConfigured(): boolean }) =>
      `${label}=${this.useReal(adapter) ? 'LIVE' : 'simulated'}`;
    const momoIn = this.useReal(this.fapshi) ? `Fapshi(${config.payments.fapshi.environment})` : 'simulated';
    // Collections and payouts are separate Fapshi services, so say which of the
    // two is actually live rather than implying one covers both.
    const momoOut = this.canDisburse('MTN_MOBILE_MONEY')
      ? momoIn
      : 'MANUAL (no disbursement service - withdrawals queue for an operator)';
    return [`MobileMoney in=${momoIn}`, `out=${momoOut}`, state('Bank', this.bank)].join(' ');
  }

  getCollectionProvider(providerName: PaymentProviderName): CollectionProvider {
    switch (providerName) {
      // Mobile money → Fapshi (both MTN & Orange). Outside live mode the
      // simulator stands in; in live mode an unconfigured rail is a fault.
      case 'MTN_MOBILE_MONEY':
      case 'ORANGE_MONEY':
        if (this.useReal(this.fapshi)) return this.fapshi;
        return config.payments.mode === 'live'
          ? this.refuseSimulatedCollection(providerName)
          : this.simulatedFor(providerName);
      case 'BANK':
        if (this.useReal(this.bank)) return this.bank;
        return config.payments.mode === 'live'
          ? this.refuseSimulatedCollection(providerName)
          : this.simulatedFor(providerName);
    }
  }

  /**
   * Whether money can actually be pushed out on this rail right now.
   *
   * Fapshi issues credentials per service and a service is either collection or
   * disbursement, so holding collection keys says nothing about being able to
   * pay anyone. When this is false the withdrawal is queued for an operator to
   * pay by hand - never simulated, never silently failed.
   */
  canDisburse(providerName: PaymentProviderName): boolean {
    if (config.payments.mode !== 'live') return true; // simulator stands in
    switch (providerName) {
      case 'MTN_MOBILE_MONEY':
      case 'ORANGE_MONEY':
        return this.fapshi.isConfigured() && this.fapshi.isPayoutConfigured();
      case 'BANK':
        return this.useReal(this.bank);
    }
  }

  /** The disbursement service's Fapshi balance, for the operator payout queue. */
  payoutBalance(): Promise<{ balance: number; currency: string }> {
    return this.fapshi.getPayoutBalance();
  }

  getDisbursementProvider(providerName: PaymentProviderName): DisbursementProvider {
    switch (providerName) {
      // Mobile money → Fapshi payout. In live mode an unconfigured Fapshi is a
      // deployment fault: simulating it would tell the user they were paid.
      case 'MTN_MOBILE_MONEY':
      case 'ORANGE_MONEY':
        if (this.useReal(this.fapshi)) return this.fapshi;
        return config.payments.mode === 'live'
          ? this.refuseSimulatedPayout(providerName)
          : this.simulatedFor(providerName);
      // Banks have no live disbursement rail yet. Outside live mode the
      // simulator stands in; in live mode this must never silently "succeed".
      case 'BANK':
        return config.payments.mode === 'live'
          ? this.refuseSimulatedPayout(providerName)
          : this.simulatedFor(providerName);
    }
  }

  getStatusProvider(providerName: PaymentProviderName): PaymentStatusProvider {
    switch (providerName) {
      case 'MTN_MOBILE_MONEY':
      case 'ORANGE_MONEY':
        if (this.useReal(this.fapshi)) return this.fapshi;
        return config.payments.mode === 'live'
          ? this.refuseSimulatedCollection(providerName)
          : this.simulatedFor(providerName);
      case 'BANK':
        if (this.useReal(this.bank)) return this.bank;
        return config.payments.mode === 'live'
          ? this.refuseSimulatedCollection(providerName)
          : this.simulatedFor(providerName);
    }
  }

  getWebhookParser(providerName: PaymentProviderName): WebhookParsingProvider {
    switch (providerName) {
      case 'MTN_MOBILE_MONEY':
      case 'ORANGE_MONEY':
        return this.useReal(this.fapshi) ? this.fapshi : this.simulatedFor(providerName);
      case 'BANK':
        return this.useReal(this.bank) ? this.bank : this.simulatedFor(providerName);
    }
  }

  /** The active mobile-money adapter (Fapshi when configured, else simulator). */
  getMobileMoneyProvider(): FapshiPaymentProvider | SimulatedPaymentProvider {
    return this.useReal(this.fapshi) ? this.fapshi : this.simulatedFor('MTN_MOBILE_MONEY');
  }
}

export const PaymentProviderFactory = new PaymentProviderFactoryImpl();
