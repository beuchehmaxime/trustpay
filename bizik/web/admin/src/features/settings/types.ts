/** System settings types - mirrors backend SettingsAdminService. */

export type Currency = 'USD' | 'EUR' | 'GBP' | 'NGN' | 'GHS' | 'XAF';
export type Locale = 'en' | 'fr';
export type SettingsGroup = 'general' | 'markets' | 'verification' | 'providers';

export interface GeneralSettings {
  platformName: string;
  supportEmail: string;
  defaultLocale: Locale;
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
  locale: Locale;
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
  /** Approve without a human when the provider's scores clear the thresholds. */
  autoApproveOnPass: boolean;
}

export interface ProviderEntry {
  id: string;
  name: string;
  enabled: boolean;
  note?: string;
}

/** Where the "an operator must look at this" line sits for withdrawals. */
export interface PayoutSettings {
  /** Withdrawals at or below this XAF-equivalent pay out automatically. 0 = all. */
  approvalThresholdXaf: number;
  /** Off sends every withdrawal to the queue, whatever the amount. */
  automaticPayouts: boolean;
}

export interface ProvidersSettings {
  kyc: ProviderEntry[];
  payments: ProviderEntry[];
  emailProvider: string;
  smsProvider: string;
  payouts: PayoutSettings;
}

export type LegalDocType = 'TERMS' | 'PRIVACY' | 'AML_POLICY' | 'COOKIE' | 'ACCEPTABLE_USE';

export interface LegalDocument {
  type: LegalDocType;
  title: string;
  content: string;
  version: string;
  published: boolean;
  effectiveAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface SettingsOverview {
  general: GeneralSettings;
  markets: MarketsSettings;
  verification: VerificationSettings;
  providers: ProvidersSettings;
  legal: LegalDocument[];
}

export interface LegalUpdateInput {
  title: string;
  content: string;
  version: string;
  published: boolean;
}
