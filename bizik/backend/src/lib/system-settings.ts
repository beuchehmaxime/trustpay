import { Currency } from '@prisma/client';

import { config } from '../config/env';
import { prisma } from './prisma';
import { CURRENCY_META } from './domain';

/**
 * System-wide platform configuration (distinct from per-user account settings
 * and from pricing, which lives in lib/settings.ts). Stored one JSON row per
 * group in `system_settings`, cached in memory, hydrated on boot and refreshed
 * whenever an operator saves. Reads never throw - they fall back to defaults.
 */

export type SettingsGroup =
  | 'general'
  | 'markets'
  | 'verification'
  | 'providers'
  | 'amlMonitoring'
  | 'retention';

export interface GeneralSettings {
  /**
   * The WhatsApp assistant's kill switch. The env var decides whether the
   * channel is configured at all; this decides whether it is SERVING - so an
   * operator can stop it during an incident without a redeploy.
   */
  whatsappEnabled: boolean;
  platformName: string;
  supportEmail: string;
  defaultLocale: 'en' | 'fr';
  signupsEnabled: boolean;
  kycRequiredForContracts: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

export interface MarketCurrency {
  code: Currency;
  label: string;
  flag: string;
  enabled: boolean;
}

export interface MarketCountry {
  name: string;
  currency: Currency;
  locale: 'en' | 'fr';
  /**
   * International dialling prefix, with the plus. This is what makes the market
   * list enforceable at the front door: identity here is a phone number, so the
   * only thing known about a stranger at signup is the country their number
   * belongs to.
   */
  dialCode: string;
  /**
   * Whether the platform operates here. A market stays in this list while
   * disabled so that turning it on later is a settings change rather than a
   * deploy - the code is multi-country, the licence is not.
   */
  enabled: boolean;
}

export interface MarketsSettings {
  defaultCurrency: Currency;
  currencies: MarketCurrency[];
  countries: MarketCountry[];
}

export interface VerificationSettings {
  kycThresholds: { confidence: number; selfie: number; match: number };
  standardTier: number;
  sanctionsScreeningEnabled: boolean;
  amlAutoFreeze: boolean;
  manualReviewOnLowConfidence: boolean;
  /**
   * Whether a submission that clears the provider's thresholds is approved
   * WITHOUT a human looking at it. Off by default: identity is the gate on
   * every other control in the platform, so a person decides. Turn it on only
   * once a real provider's scores are trusted enough to stand alone.
   */
  autoApproveOnPass: boolean;
}

export interface ProviderEntry {
  id: string;
  name: string;
  enabled: boolean;
  note?: string;
}

/**
 * How withdrawals are paid out. Payouts go straight to the user's mobile money
 * as soon as they ask - an operator only sees the ones worth a second pair of
 * eyes, and where that line sits is an operator decision, not a redeploy.
 */
export interface PayoutSettings {
  /**
   * Withdrawals at or below this XAF-equivalent are sent automatically.
   * Anything ABOVE it waits for approval. 0 disables review entirely, so every
   * withdrawal is automatic.
   */
  approvalThresholdXaf: number;
  /**
   * Master switch. Off means every withdrawal waits for an operator, whatever
   * the amount - a kill switch for an incident, without touching the rail.
   */
  automaticPayouts: boolean;
  /**
   * Warn when the provider's DISBURSEMENT balance falls below this.
   *
   * Withdrawals are paid from a separate service balance that deposits do not
   * replenish - Fapshi has no API to move money from collection to payout, and
   * a payout-enabled service cannot collect at all. So the float only drains,
   * and without a warning the first sign of it emptying is a user who cannot
   * withdraw. 0 switches the check off.
   */
  floatWarningXaf: number;
}

/**
 * What the payment rail charges us, and whether we pass it on.
 *
 * Settings rather than constants because these are commercial terms Fapshi
 * sets and can change, and because they are ESTIMATES: Fapshi reports its
 * actual cut only after a transaction settles, so these have to be corrected
 * against what really happens. A rate that needs a deploy to change is a rate
 * that stays wrong.
 */
export interface ProviderFeeSettings {
  /** Charge the collection fee on top of a deposit, rather than absorbing it. */
  chargeOnDeposit: boolean;
  /** Charge the disbursement fee on top of a withdrawal debit. */
  chargeOnWithdrawal: boolean;
  /** Fraction of the amount, e.g. 0.03 for 3%. */
  depositRate: number;
  withdrawalRate: number;
  /** Floor, because percentage rails almost always carry one. */
  depositMinimumXaf: number;
  withdrawalMinimumXaf: number;
}

export interface ProvidersSettings {
  kyc: ProviderEntry[];
  payments: ProviderEntry[];
  emailProvider: string;
  smsProvider: string;
  payouts: PayoutSettings;
  providerFees: ProviderFeeSettings;
}

/**
 * Thresholds for ongoing transaction monitoring.
 *
 * Settings rather than constants because the right numbers are not knowable in
 * advance: they depend on what normal traffic looks like, and a threshold that
 * needs a deploy to change is a threshold that stays wrong. Everything is in
 * USD so multi-currency wallets compare on one scale.
 */
export interface AmlMonitoringSettings {
  enabled: boolean;
  /**
   * The REGULATORY reporting threshold, in XAF. This is the figure structuring
   * exists to evade, so the structuring rule is keyed off it rather than off
   * our own review line.
   *
   * CEMAC Regulation No. 01/CEMAC/UMAC/CM of 11 April 2016 governs AML/CFT in
   * Central Africa and sets a cash-transaction declaration threshold.
   * 5,000,000 XAF is the figure in common use, but it is the one number here
   * that carries legal weight: have counsel confirm it against the current
   * instrument before relying on it, and change it in Settings if it differs.
   */
  reportingThresholdXaf: number;
  /**
   * Our OWN review line, in XAF - deliberately well below the regulatory one.
   * A movement at or above this opens a case. Set at roughly twice the
   * per-transaction cap of a Cameroonian mobile-money wallet, so an ordinary
   * cash-out never trips it and an unusual one always does.
   */
  reviewThresholdXaf: number;
  /** Hours of history the structuring rule looks across. */
  structuringWindowHours: number;
  /** How many near-threshold deposits it takes to look deliberate. */
  structuringMinCount: number;
  /**
   * How close to the reporting threshold a deposit must be to count as "just
   * under it". 0.3 means a 1,500,000 XAF deposit counts against a 5,000,000
   * threshold while a 20,000 XAF one does not - otherwise ordinary small
   * top-ups look like evasion and the queue fills with noise.
   */
  structuringNearThresholdRatio: number;
  velocityWindowHours: number;
  velocityMaxCount: number;
  velocityMaxXaf: number;
  passThroughWindowHours: number;
  /** Below this, money passing straight through is too small to be worth a case. */
  passThroughMinXaf: number;
  /** Share of what arrived that must leave again to look like a corridor. */
  passThroughRatio: number;
  /**
   * Hold an outbound payment while the account has an unresolved case.
   *
   * This is the difference between a monitoring system and a reporting one. An
   * alert raised after the money has gone documents a loss; holding the payout
   * until a person has looked prevents one. It holds the TRANSACTION, never the
   * account: the customer keeps their balance and their access, and a cleared
   * case releases the payout.
   */
  holdOutboundOnOpenCase: boolean;
}

/**
 * How long operational data is kept.
 *
 * Only the classes whose usefulness genuinely decays appear here. Financial
 * records, audit logs, KYC and AML cases are deliberately absent and are never
 * deleted on a timer - see lib/retention.ts for why.
 */
export interface RetentionSettings {
  enabled: boolean;
  /** Expired or revoked sessions and refresh tokens. */
  expiredSessionDays: number;
  /** Login attempts - useful for catching a brute-force run this week, not last year. */
  loginAttemptDays: number;
  /** Notifications the user has ALREADY read. Unread ones are never purged. */
  readNotificationDays: number;
  /**
   * Raw visitor events. The highest-volume table in the product by far, and the
   * one whose rows lose value fastest: a page view from last year answers no
   * question anybody asks. Aggregates computed from them are not affected.
   */
  analyticsEventDays: number;
  /**
   * Whether the dormant-account rules run at all.
   *
   * OFF by default, and deliberately so. Switching this on starts sending real
   * people a message saying their account will be closed, and the first run
   * reaches everybody who is already past the notice threshold - which on a
   * young platform is most of the sign-ups at once. That should be somebody's
   * decision after looking at the candidate list, not a side effect of
   * deploying the feature.
   *
   * The review screen works either way: candidates are always computed, so an
   * operator can see exactly who would be affected before turning it on.
   */
  dormancyEnabled: boolean;
  /**
   * Days after signup an account that never verified its identity becomes a
   * candidate for deletion. Candidate, not deleted: the schedule only ever
   * finds and warns, and an operator decides.
   */
  dormantUnverifiedDays: number;
  /**
   * Days after signup a fully verified account that has done nothing at all
   * becomes a candidate. Longer than the unverified window, because somebody
   * who finished verification showed intent and deserves more room.
   */
  dormantInactiveDays: number;
}

export interface SystemSettings {
  general: GeneralSettings;
  markets: MarketsSettings;
  verification: VerificationSettings;
  providers: ProvidersSettings;
  amlMonitoring: AmlMonitoringSettings;
  retention: RetentionSettings;
}

const ALL_CURRENCIES = Object.keys(CURRENCY_META) as Currency[];

/**
 * The markets the platform knows how to serve, and which of them it actually
 * operates in.
 *
 * Only Cameroon is enabled. The rest stay listed and switched OFF because
 * holding other people's money is licensed country by country: the code is
 * multi-country, the authorisation is not, and opening a market before being
 * authorised there is the kind of mistake that ends a payments company.
 *
 * Turning one on is a settings change in the admin console - no deploy - and
 * should happen only once there is a legal basis for it. For an EU or UK market
 * that means a GDPR programme as well, which is a far larger undertaking than
 * flipping the flag.
 */
const DEFAULT_COUNTRIES: MarketCountry[] = [
  { name: 'Cameroon', currency: 'XAF', locale: 'fr', dialCode: '+237', enabled: true },

  // CEMAC neighbours. Same currency and the same regulator, so these are the
  // nearest expansion and the least work - but still a separate authorisation.
  { name: 'Chad', currency: 'XAF', locale: 'fr', dialCode: '+235', enabled: false },
  { name: 'Gabon', currency: 'XAF', locale: 'fr', dialCode: '+241', enabled: false },
  { name: 'Central African Republic', currency: 'XAF', locale: 'fr', dialCode: '+236', enabled: false },
  { name: 'Equatorial Guinea', currency: 'XAF', locale: 'fr', dialCode: '+240', enabled: false },

  // West Africa.
  { name: 'Nigeria', currency: 'NGN', locale: 'en', dialCode: '+234', enabled: false },
  { name: 'Ghana', currency: 'GHS', locale: 'en', dialCode: '+233', enabled: false },

  // Each of these brings GDPR or UK GDPR with it in full: data-subject rights,
  // processor contracts, transfer mechanisms. Do not enable one without them.
  { name: 'United Kingdom', currency: 'GBP', locale: 'en', dialCode: '+44', enabled: false },
  { name: 'France', currency: 'EUR', locale: 'fr', dialCode: '+33', enabled: false },
  { name: 'Germany', currency: 'EUR', locale: 'en', dialCode: '+49', enabled: false },
  { name: 'Netherlands', currency: 'EUR', locale: 'en', dialCode: '+31', enabled: false },
  { name: 'Ireland', currency: 'EUR', locale: 'en', dialCode: '+353', enabled: false },
  { name: 'United States', currency: 'USD', locale: 'en', dialCode: '+1', enabled: false },
];

/** Factory so each call returns a fresh, mutation-safe copy. */
export function defaultSettings(): SystemSettings {
  return {
    general: {
      platformName: 'BiZik',
      supportEmail: config.email.fromEmail || 'support@bizik.cm',
      defaultLocale: 'en',
      whatsappEnabled: true,
      signupsEnabled: true,
      kycRequiredForContracts: true,
      maintenanceMode: false,
      maintenanceMessage: 'BiZik is undergoing scheduled maintenance. Please check back shortly.',
    },
    markets: {
      defaultCurrency: 'USD',
      currencies: ALL_CURRENCIES.map((code) => ({
        code,
        label: CURRENCY_META[code].label,
        flag: CURRENCY_META[code].flag,
        enabled: true,
      })),
      countries: DEFAULT_COUNTRIES.map((country) => ({ ...country })),
    },
    amlMonitoring: {
      enabled: true,
      // Denominated in XAF because the market is Cameroon and the obligations
      // are CEMAC's. A USD threshold would drift against the regulatory figure
      // every time the rate moved, which is the wrong thing to let float.
      reportingThresholdXaf: 5_000_000,
      // Roughly twice the per-transaction cap of a Cameroonian mobile-money
      // wallet, and twice our own withdrawal-approval line, so a normal
      // cash-out never trips it.
      reviewThresholdXaf: 1_000_000,
      structuringWindowHours: 72,
      structuringMinCount: 3,
      structuringNearThresholdRatio: 0.3,
      velocityWindowHours: 24,
      velocityMaxCount: 15,
      velocityMaxXaf: 3_000_000,
      passThroughWindowHours: 24,
      passThroughMinXaf: 300_000,
      passThroughRatio: 0.8,
      holdOutboundOnOpenCase: true,
    },
    retention: {
      enabled: true,
      expiredSessionDays: 90,
      loginAttemptDays: 365,
      readNotificationDays: 365,
      analyticsEventDays: 180,
      dormancyEnabled: false,
      dormantUnverifiedDays: 30,
      dormantInactiveDays: 90,
    },
    verification: {
      kycThresholds: { ...config.kyc.thresholds },
      standardTier: config.kyc.standardTier,
      sanctionsScreeningEnabled: true,
      amlAutoFreeze: true,
      manualReviewOnLowConfidence: true,
      autoApproveOnPass: false,
    },
    providers: {
      kyc: [
        { id: 'smile_identity', name: 'Smile Identity', enabled: true, note: 'African markets' },
        { id: 'stripe_identity', name: 'Stripe Identity', enabled: true, note: 'Rest of world' },
      ],
      payments: [
        { id: 'stripe', name: 'Stripe', enabled: true },
        { id: 'paystack', name: 'Paystack', enabled: true },
        { id: 'flutterwave', name: 'Flutterwave', enabled: true },
        { id: 'mtn_momo', name: 'MTN MoMo', enabled: true },
        { id: 'orange_money', name: 'Orange Money', enabled: true },
        { id: 'payoneer', name: 'Payoneer', enabled: true },
        { id: 'wise', name: 'Wise', enabled: false },
        { id: 'paypal', name: 'PayPal', enabled: false },
      ],
      emailProvider: 'SMTP (nodemailer)',
      smsProvider: 'Twilio',
      payouts: {
        approvalThresholdXaf: config.payments.withdrawalApprovalXaf,
        automaticPayouts: true,
        // Roughly a few typical withdrawals of headroom, so there is time to
        // move money across before anyone is affected rather than after.
        floatWarningXaf: 25_000,
      },
      providerFees: {
        // Fapshi's published standard pricing (fapshi.com/pricing):
        //   3% per successful payment collection
        //   0% for payouts (withdrawals) - "No withdrawal fees"
        // The live transaction that exposed the problem agrees on collections:
        // Fapshi reported amount 250 and revenue 242, and 250 x 3% = 7.5, which
        // it rounded up to 8 exactly as we do.
        //
        // Payouts cost nothing, so nothing is charged for them. Keeping the
        // switch here rather than deleting it: a custom contract or a different
        // rail can carry a disbursement fee, and the alternative to a 0 is a
        // code change on the day that happens.
        chargeOnDeposit: true,
        chargeOnWithdrawal: false,
        depositRate: 0.03,
        withdrawalRate: 0,
        // No floor in the published pricing, and ceil() already means any
        // non-zero amount carries at least one franc on a collection. Asserting
        // a minimum Fapshi does not charge would be inventing a fee.
        depositMinimumXaf: 0,
        withdrawalMinimumXaf: 0,
      },
    },
  };
}

let cache: SystemSettings = defaultSettings();

/** Current system settings (never throws - falls back to defaults). */
export function systemSettings(): SystemSettings {
  return cache;
}

/**
 * Transaction-monitoring thresholds, merged over the defaults.
 *
 * Merged rather than returned raw because a settings row saved before a rule
 * existed has no value for it, and a missing threshold must not silently
 * become `undefined` and disable a rule - a detection system that quietly
 * stops detecting is worse than one that was never installed.
 */
export function amlMonitoringSettings(): AmlMonitoringSettings {
  return { ...defaultSettings().amlMonitoring, ...(cache.amlMonitoring ?? {}) };
}

/** Retention periods, merged over the defaults so a rule can never be undefined. */
export function retentionSettings(): RetentionSettings {
  return { ...defaultSettings().retention, ...(cache.retention ?? {}) };
}

/**
 * Payout automation, as configured by an operator. Falls back to the env
 * default (WITHDRAWAL_APPROVAL_XAF) until someone saves the setting.
 */
export function payoutSettings(): PayoutSettings {
  const configured = cache.providers.payouts;
  return {
    approvalThresholdXaf: Number.isFinite(configured?.approvalThresholdXaf)
      ? configured.approvalThresholdXaf
      : config.payments.withdrawalApprovalXaf,
    automaticPayouts: configured?.automaticPayouts !== false,
    floatWarningXaf: Number.isFinite(configured?.floatWarningXaf)
      ? configured.floatWarningXaf
      : 25_000,
  };
}

/** Whether a currency is currently enabled for money movement (unknown → allowed). */
export function isCurrencyEnabled(currency: Currency): boolean {
  const found = cache.markets.currencies.find((entry) => entry.code === currency);
  return found ? found.enabled : true;
}

/**
 * Whether a country is open for signup/verification. A country that is not in
 * the configured list is allowed (we only block ones explicitly disabled).
 */
export function isCountryEnabled(country?: string | null): boolean {
  if (!country) return true;
  const found = cache.markets.countries.find(
    (entry) => entry.name.toLowerCase() === country.trim().toLowerCase(),
  );
  return found ? found.enabled : true;
}

/**
 * Is this phone number in a market the platform operates in?
 *
 * The front-door check. Identity here is a phone number, so the dialling prefix
 * is the only thing known about a stranger at signup, and it is enough: a
 * number that belongs to a country we are not authorised in should not be able
 * to open an account at all. Checking later - at KYC, say - means the personal
 * data of someone in a market we cannot serve has already been collected, which
 * is the problem rather than the fix.
 *
 * Longest prefix wins, so +1 (United States) cannot shadow a longer code that
 * happens to start with the same digit.
 */
export function isPhoneInEnabledMarket(phone?: string | null): boolean {
  if (!phone) return false;
  const normalised = phone.replace(/[^\d+]/g, '');
  const enabled = cache.markets.countries.filter((country) => country.enabled && country.dialCode);
  // No market configured with a dial code at all: fail OPEN rather than lock
  // every signup out on a settings mistake. The market list is the control; an
  // empty one is a misconfiguration, not a decision to admit nobody.
  if (!enabled.length) return true;
  return enabled
    .slice()
    .sort((left, right) => right.dialCode.length - left.dialCode.length)
    .some((country) => normalised.startsWith(country.dialCode));
}

/** The markets currently open, for messages that need to name them. */
export function enabledMarketNames(): string[] {
  return cache.markets.countries.filter((country) => country.enabled).map((country) => country.name);
}

/** Whether a KYC/identity provider is enabled (unknown → allowed). */
export function isKycProviderEnabled(id: string): boolean {
  const found = cache.providers.kyc.find((entry) => entry.id === id);
  return found ? found.enabled : true;
}

/** Merge a stored partial group over the defaults so the shape is always whole. */
function mergeGroup<Group extends SettingsGroup>(
  group: Group,
  stored: unknown,
): SystemSettings[Group] {
  const base = defaultSettings()[group];
  if (stored && typeof stored === 'object') {
    return { ...base, ...(stored as object) } as SystemSettings[Group];
  }
  return base;
}

/** Hydrate the cache from the DB (call on boot, after seeding). */
export async function loadSystemSettings(): Promise<void> {
  const rows = await prisma.systemSetting.findMany();
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  cache = {
    general: mergeGroup('general', byKey.get('general')),
    markets: mergeGroup('markets', byKey.get('markets')),
    verification: mergeGroup('verification', byKey.get('verification')),
    providers: mergeGroup('providers', byKey.get('providers')),
    amlMonitoring: mergeGroup('amlMonitoring', byKey.get('amlMonitoring')),
    retention: mergeGroup('retention', byKey.get('retention')),
  };
}

/** Refresh the cache after an operator edits a group. */
export async function refreshSystemSettings(): Promise<void> {
  await loadSystemSettings();
}
