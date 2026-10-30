import path from 'path';

import dotenv from 'dotenv';
import { feeRateFromEnv } from './fee-rate';

dotenv.config();

/** Typed, centralised runtime configuration for the backend. */
/**
 * `PAYMENTS_MODE` decides whether money is real. It is compared by equality in
 * several places, so an unrecognised value ("LIVE", "production") would quietly
 * select the simulator. Only the two known values are accepted.
 */
function parsePaymentsMode(raw: string | undefined): 'simulated' | 'live' {
  const value = (raw ?? 'simulated').trim().toLowerCase();
  if (value === 'live') return 'live';
  if (value === 'simulated' || value === '') return 'simulated';
  throw new Error(`Invalid PAYMENTS_MODE "${raw}". Use "live" or "simulated".`);
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  appUrl: process.env.APP_URL || 'http://localhost:8080',
  /**
   * Public web (marketing/PWA) base URL - where the human-readable Terms and
   * Privacy pages live (/terms, /privacy). APP_URL is the backend API, which
   * does NOT serve those pages, so legal links must use this. Set WEB_URL to
   * your public site in production.
   */
  webUrl: (process.env.WEB_URL || 'http://localhost:3100').replace(/\/+$/, ''),
  /**
   * Browser origins allowed by CORS (the user PWA + admin console). Mobile apps
   * and server-to-server calls send no Origin header and are allowed separately.
   * Override in production via CORS_ORIGINS (comma-separated).
   */
  corsOrigins: (
    process.env.CORS_ORIGINS ||
    'http://localhost:3000,http://localhost:3001,http://localhost:3100,http://localhost:3101'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    /**
     * Access token lifetime - kept short (1h) so a stolen access token has a
     * small window; clients refresh silently via the 90-day refresh token.
     * Override with JWT_ACCESS_TTL if a deployment needs a different value.
     */
    accessTtl: process.env.JWT_ACCESS_TTL || '1h',
    /** Refresh token lifetime - 90 days keeps users signed in for months. */
    refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS) || 90,
  },

  /** SRS NFR-SEC-003: bcrypt cost factor >= 12. */
  bcryptRounds: 12,

  /** SRS FR-AUTH-003: lock after 5 failures for 30 minutes. */
  login: { maxAttempts: 5, lockMinutes: 30 },

  /** SRS FR-AUTH-004: SMS/email OTP expires in 10 minutes. */
  otpTtlMinutes: 10,

  /** SRS FR-AUTH-001/002: email verification window. */
  emailVerifyTtlHours: 24,

  /** SRS FR-AUTH-006: password reset link valid 60 minutes. */
  passwordResetTtlMinutes: 60,

  /** One-time verification code lifetime. */
  emailCodeTtlMinutes: 10,

  totp: { issuer: 'BiZik' },

  /**
   * KYC / identity verification (SRS MOD-02, FR-KYC-001..006).
   * Encryption key protects the ID number at rest (NFR-SEC-002). Confidence
   * thresholds gate automatic approval vs. routing to the manual review queue
   * (INT-KYC-004): a submission auto-approves only when the provider's overall
   * confidence, liveness (selfie) and face-to-ID match all clear the bar.
   */
  kyc: {
    encKey: process.env.KYC_ENC_KEY || 'dev-kyc-encryption-key-change-me',
    /** Tier unlocked by a passed ID + selfie check. */
    standardTier: 2,
    thresholds: {
      confidence: Number(process.env.KYC_MIN_CONFIDENCE) || 0.85,
      selfie: Number(process.env.KYC_MIN_LIVENESS) || 0.9,
      match: Number(process.env.KYC_MIN_MATCH) || 0.85,
    },
    /**
     * The image-analysis service. Unset = submissions are recorded as
     * un-analysed; the console then says so instead of showing scores.
     */
    analyzerUrl: process.env.KYC_ANALYZER_URL || '',
    analyzerTimeoutMs: Number(process.env.KYC_ANALYZER_TIMEOUT_MS) || 20000,
  },

  /** Cloudinary asset storage for uploaded images (deliverables, dispute evidence). */
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },

  /** Local document storage (stands in for the encrypted S3 bucket in prod). */
  uploads: {
    dir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
    /** Max single document size (base64-decoded bytes). */
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES) || 8 * 1024 * 1024,
  },

  /**
   * Escrow & fees (SRS FR-PAY-010). Client pays a service fee at funding;
   * the freelancer fee is deducted from each milestone at release. Express
   * withdrawal and FX conversion carry their own margins.
   */
  fees: {
    // Fractions (0.025 = 2.5%). The env may say "10" for 10%: see fee-rate.ts.
    // Defaults match what bizik.cm/pricing promises: 2.5% charged once, at
    // funding, and nothing at release; 1.2% over mid-market on conversions.
    clientServicePct: feeRateFromEnv('FEE_CLIENT_PCT', 0.025), // 2.5% at funding
    freelancerFeePct: feeRateFromEnv('FEE_FREELANCER_PCT', 0), // nothing on release
    expressWithdrawalPct: feeRateFromEnv('FEE_EXPRESS_PCT', 0.015), // +1.5%
    fxMarginPct: feeRateFromEnv('FEE_FX_MARGIN_PCT', 0.012), // +1.2% over mid-market
  },
  /**
   * Live FX feed (FR-PAY-009). A free, key-less provider drives real mid-market
   * rates; conversions fall back to the admin-configured rates if it's down.
   */
  fx: {
    // Off by default: the admin-configured Exchange Rates are authoritative for
    // all conversions. Opt in (FX_FEED_ENABLED=true) only to run the feed as a
    // reference - it no longer overrides the admin rates.
    feedEnabled: (process.env.FX_FEED_ENABLED ?? 'false') === 'true',
    feedUrl: process.env.FX_FEED_URL || 'https://open.er-api.com/v6/latest/USD',
    feedRefreshMs: Number(process.env.FX_FEED_REFRESH_MS) || 60 * 60 * 1000, // hourly
    feedTimeoutMs: Number(process.env.FX_FEED_TIMEOUT_MS) || 8000,
  },
  escrow: {
    /** Minimum withdrawal in USD-equivalent (FR-PAY-008). */
    minWithdrawalUsd: 5,
    /** How often the auto-release scheduler runs (ms). 0 disables it. */
    autoReleaseIntervalMs: Number(process.env.AUTO_RELEASE_INTERVAL_MS) || 5 * 60 * 1000,
  },

  /**
   * Weekly digest email - a once-a-week summary of each user's project history
   * and transactions, to reinforce trust. Cron in the server's timezone; default
   * Monday 09:00. Disable with DIGEST_ENABLED=false.
   */
  digest: {
    enabled: process.env.DIGEST_ENABLED !== 'false',
    cron: process.env.DIGEST_CRON || '0 9 * * 1',
  },

  /** Delivery-date reminders: notify both parties the day before a milestone is due. */
  reminder: {
    enabled: process.env.REMINDER_ENABLED !== 'false',
    cron: process.env.REMINDER_CRON || '0 8 * * *', // daily at 08:00 server time
  },

  /**
   * Provider-agnostic payment gateway (MTN MoMo, Orange Money, banks).
   *
   * `mode=simulated` (default) uses an in-process fake so the full deposit/
   * withdrawal lifecycle works with zero credentials. Set `mode=live` and fill
   * a provider's credentials to route that provider's traffic to its real API;
   * any provider left unconfigured still falls back to the simulator. Real MoMo
   * calls are asynchronous - the wallet is only credited on a confirmed webhook
   * or reconciliation, never on the initial accept.
   */
  payments: {
    mode: parsePaymentsMode(process.env.PAYMENTS_MODE),
    defaultCurrency: process.env.PAYMENT_DEFAULT_CURRENCY || 'XAF',
    /**
     * Public base URL providers call back to (webhooks). Deliberately NOT
     * falling back to APP_URL: MTN rejects a requesttopay whose X-Callback-Url
     * host doesn't match the API user's registered host, so we only advertise a
     * callback when a real public URL is explicitly set (else reconciliation
     * polling confirms payments).
     */
    callbackBaseUrl: process.env.PAYMENT_CALLBACK_BASE_URL || '',
    /**
     * Mobile-money withdrawals in XAF (CEMAC - Cameroon, Gabon, Chad, CAR,
     * Congo, Eq. Guinea) above this amount are held for manual approval before
     * disbursement. Everything at or below settles instantly. 0 disables holds.
     */
    withdrawalApprovalXaf: Number(process.env.WITHDRAWAL_APPROVAL_XAF) || 500_000,
    /**
     * A held (awaiting-approval) withdrawal that no operator actions within this
     * many hours is auto-rejected and the reserved funds are refunded, so money
     * is never trapped indefinitely. 0 disables auto-expiry.
     */
    withdrawalApprovalSlaHours: Number(process.env.WITHDRAWAL_APPROVAL_SLA_HOURS) || 72,
    /**
     * Fapshi aggregator (Cameroon mobile money). All MTN/Orange collections and
     * payouts are routed through Fapshi for now. `FAPSHI_ENVIRONMENT=sandbox`
     * hits sandbox.fapshi.com; `live` hits live.fapshi.com. Credentials
     * (apiuser/apikey) are per-service and set in the Fapshi dashboard.
     */
    fapshi: {
      environment: process.env.FAPSHI_ENVIRONMENT || 'sandbox',
      baseUrl:
        (process.env.FAPSHI_ENVIRONMENT || 'sandbox') === 'live'
          ? 'https://live.fapshi.com'
          : 'https://sandbox.fapshi.com',
      apiUser: process.env.FAPSHI_API_USER || '',
      apiKey: process.env.FAPSHI_API_KEY || '',
      /**
       * Fapshi issues credentials PER SERVICE, and a service is either
       * collection or disbursement - never both. So paying users out needs a
       * second, payout-enabled service with its own apiuser/apikey. Payouts are
       * also off by default on live: you test in sandbox, then ask Fapshi
       * support to enable payouts for that live API user.
       *
       * Until these are set, withdrawals are still accepted: the funds are
       * reserved and the request waits in the operator payout queue to be paid
       * by hand. What must never happen is pretending a payout succeeded.
       */
      payoutApiUser: process.env.FAPSHI_PAYOUT_API_USER || '',
      payoutApiKey: process.env.FAPSHI_PAYOUT_API_KEY || '',
      /** Shared secret Fapshi echoes in the `x-wh-secret` webhook header. */
      webhookSecret: process.env.FAPSHI_WEBHOOK_SECRET || '',
    },
    reconciliation: {
      enabled: process.env.PAYMENT_RECONCILE_ENABLED !== 'false',
      cron: process.env.PAYMENT_RECONCILE_CRON || '*/2 * * * *', // every 2 minutes
    },
    mtn: {
      baseUrl: process.env.MTN_BASE_URL || 'https://sandbox.momodeveloper.mtn.com',
      /** MTN "X-Target-Environment": sandbox | mtncameroon | … */
      environment: process.env.MTN_ENVIRONMENT || 'sandbox',
      collection: {
        subscriptionKey: process.env.MTN_COLLECTION_SUBSCRIPTION_KEY || '',
        userId: process.env.MTN_COLLECTION_USER_ID || '',
        apiKey: process.env.MTN_COLLECTION_API_KEY || '',
      },
      disbursement: {
        subscriptionKey: process.env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY || '',
        userId: process.env.MTN_DISBURSEMENT_USER_ID || '',
        apiKey: process.env.MTN_DISBURSEMENT_API_KEY || '',
      },
    },
    orange: {
      baseUrl: process.env.ORANGE_BASE_URL || '',
      clientId: process.env.ORANGE_CLIENT_ID || '',
      clientSecret: process.env.ORANGE_CLIENT_SECRET || '',
      merchantKey: process.env.ORANGE_MERCHANT_KEY || '',
    },
  },

  /**
   * WhatsApp Assistant channel. A single shared bot (one business number) that
   * users chat with to run BiZik. Disabled unless WHATSAPP_ENABLED=true, so it
   * never affects the app until configured. Provider defaults to Meta's WhatsApp
   * Cloud API (Graph). See docs/whatsapp-bot-integration-plan.md.
   */
  whatsapp: {
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    provider: process.env.WHATSAPP_PROVIDER || 'meta', // 'meta' (Cloud API)
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v21.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    /** App secret used to verify inbound webhook signatures (X-Hub-Signature-256). */
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    /** Token echoed back on the GET webhook-verification handshake with Meta. */
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    /**
     * Name of the APPROVED authentication template used to deliver one-time
     * codes over WhatsApp. Meta refuses business-initiated messages without
     * one, so leaving this empty simply keeps codes on SMS rather than adding
     * a failed attempt before every send.
     */
    otpTemplate: process.env.WHATSAPP_OTP_TEMPLATE || '',
    otpTemplateLanguage: process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'en',
    otpTemplateLanguageFr: process.env.WHATSAPP_OTP_TEMPLATE_LANG_FR || 'fr',

    /**
     * Which WhatsApp route carries one-time codes: 'meta' (Cloud API template)
     * or 'wasender' (WasenderAPI free-form text).
     *
     * Defaults to wasender whenever a WasenderAPI key is present, so the switch
     * is one variable rather than two that have to agree. Clear the key, or set
     * this to 'meta', and codes go back to the Cloud API with no other change -
     * which is the point: the Meta path stays wired up for the day the official
     * number and template are approved.
     *
     * This governs CODES ONLY. The assistant, the admin inbox and outreach stay
     * on Meta regardless, because they need interactive buttons, list menus and
     * signed webhooks that WasenderAPI does not offer.
     */
    otpProvider: (process.env.WHATSAPP_OTP_PROVIDER ||
      (process.env.WASENDER_API_KEY ? 'wasender' : 'meta')) as 'meta' | 'wasender',

    /**
     * Which rail carries OUTREACH campaigns. Separate from otpProvider on
     * purpose: codes are one message to somebody who just asked for it, and a
     * campaign is hundreds of unprompted messages. They carry very different
     * risk, and being able to move one without the other is the point.
     *
     * Defaults the same way - wasender when a key is present - so the two stay
     * in step unless somebody deliberately splits them.
     */
    outreachProvider: (process.env.WHATSAPP_OUTREACH_PROVIDER ||
      (process.env.WASENDER_API_KEY ? 'wasender' : 'meta')) as 'meta' | 'wasender',

    /**
     * How fast a campaign is allowed to send, in messages per minute.
     *
     * Deliberately slow. Bulk outreach from a QR-linked WhatsApp account is the
     * single most reliable way to get that number banned - Meta's abuse
     * detection is looking for exactly this shape of traffic, and the account
     * is not protected by being a business API client because it is not one.
     * The old in-process loop sent one every 120ms, which is eight a second and
     * would not survive a first campaign.
     *
     * 10 a minute is roughly one every six seconds, with jitter on top.
     */
    outreachPerMinute: Number(process.env.WHATSAPP_OUTREACH_PER_MINUTE) || 10,
    /**
     * Ceiling on how many campaign messages leave in a rolling day, across all
     * campaigns. A pace limit alone does not stop a slow flood.
     */
    outreachDailyCap: Number(process.env.WHATSAPP_OUTREACH_DAILY_CAP) || 400,
    /**
     * The hard floor between two campaign messages, in milliseconds.
     *
     * WasenderAPI's "account protection" refuses a second message within FIVE
     * SECONDS, and refuses it as a failure rather than a wait. The first
     * version of the queue paced the gap between BATCHES of three and sent the
     * three back to back, so one of every three landed and two were written off
     * - 52 of 58 failures across the first two live campaigns.
     *
     * 6 seconds, not 5: a floor set exactly at the provider's limit loses the
     * race on any clock skew or network jitter.
     */
    outreachMinGapMs: Number(process.env.WHATSAPP_OUTREACH_MIN_GAP_MS) || 6_000,

    /** Idle minutes before the conversational session context is dropped. */
    sessionTtlMinutes: Number(process.env.WHATSAPP_SESSION_TTL_MIN) || 30,
    /** Require a transaction PIN before any money action (recommended: true). */
    requirePin: process.env.WHATSAPP_REQUIRE_PIN !== 'false',
    /**
     * Days the inbound/outbound message audit log is kept before a nightly
     * purge. Chat logs hold personal conversation content, so they are retained
     * only as long as support/compliance genuinely needs them.
     */
    logRetentionDays: Number(process.env.WHATSAPP_LOG_RETENTION_DAYS) || 90,
    /**
     * Cost + abuse ceilings on the AI. Deterministic menus/commands keep working
     * once a ceiling is hit - only free-text LLM turns are refused. 0 disables.
     */
    aiTurnsPerUserDaily: Number(process.env.WHATSAPP_AI_TURNS_PER_DAY ?? 80),
    aiTurnsGlobalDaily: Number(process.env.WHATSAPP_AI_TURNS_GLOBAL_PER_DAY ?? 5000),
  },

  /**
   * WasenderAPI - the interim carrier for WhatsApp verification codes.
   *
   * Switched on purely by the presence of a key, with no separate enable flag,
   * because a half-configured messaging channel is worse than an absent one:
   * there is no state here where it is "on" but cannot send.
   *
   * See docs/wasender-otp-setup.md for what has to be true on their side.
   */
  wasender: {
    apiKey: process.env.WASENDER_API_KEY || '',
    baseUrl: process.env.WASENDER_BASE_URL || 'https://www.wasenderapi.com',
    /**
     * A code nobody has received yet is worth less with every second, and SMS
     * is waiting behind it, so the call is given a short leash rather than the
     * default socket timeout.
     */
    timeoutMs: Number(process.env.WASENDER_TIMEOUT_MS) || 10_000,
  },

  /**
   * AI providers for the WhatsApp Assistant. Claude is the reasoning + tool-use
   * brain; OpenAI transcribes voice notes (Whisper) and can act as a fallback.
   * The model default follows the claude-api skill (Opus 5); override for cost.
   */
  ai: {
    /**
     * The assistant's brain. Meta Model API by default.
     *
     * Meta's Messages API is Anthropic-compatible, so the Anthropic SDK is
     * pointed at it rather than replaced: same client, same MessageParam
     * types, same tool_use blocks, same multi-hop loop. Verified against the
     * live endpoint - tools work and a turn comes back as
     * `redacted_thinking, text, tool_use` with `stop_reason: "tool_use"`.
     *
     * Leave ANTHROPIC_BASE_URL unset to use Meta. Setting it back to
     * Anthropic's own host with an Anthropic key restores the previous
     * behaviour, which is why the switch is a base URL and not a rewrite.
     */
    anthropicApiKey: process.env.MODEL_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    // BARE host, no /v1: the Anthropic SDK appends /v1/messages itself.
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.meta.ai',
    anthropicModel: process.env.ASSISTANT_MODEL || process.env.ANTHROPIC_MODEL || 'muse-spark-1.3',
    /**
     * Muse Spark THINKS before it answers, and the thinking is billed against
     * max_tokens before a single word of reply is written. Measured on this
     * endpoint: a one-tool turn spent 440 of 490 output tokens thinking. The
     * old ceiling of 1024 would leave a complex turn - read the deal, work out
     * who pays, propose the action - with almost nothing left to answer with,
     * and the symptom is an empty reply rather than an error.
     */
    assistantMaxTokens: Number(process.env.ASSISTANT_MAX_TOKENS) || 8192,
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiTranscribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
    /** Muse Voice Transcribe: 25 languages WITH code-switching, turn-level timing. */
    metaVoiceModel: process.env.MUSE_VOICE_MODEL || 'muse-voice-transcribe-1.0',
    /**
     * The REST base, WITH /v1.
     *
     * Separate from `anthropicBaseUrl` above, and the difference is not
     * cosmetic: that one is bare because the Anthropic SDK appends the version
     * and the path itself. Transcription is a plain fetch with no SDK in front
     * of it, so the version has to be here or the request lands on /asr/...
     * and gets a bodyless 404 that reads like an outage.
     */
    metaApiBaseUrl: process.env.META_API_BASE_URL || 'https://api.meta.ai/v1',
  },

  /** SMTP email delivery (transactional email - verification codes, etc.). */
  /**
   * TEMPORARY: skip the SMS code at signup and sign-in.
   *
   * Phone numbers are this platform's identity - deals are invited by number,
   * transfers route to one, and password reset goes there - so verification is
   * REQUIRED by default and this must never default to off. It exists because
   * SMS delivery can be blocked by something outside the code (a Twilio trial
   * account rejects every number it has not verified, which silently stopped
   * all nine signups in September 2026), and a platform nobody can join is
   * worse than one with unproven numbers for a few weeks.
   *
   * `PHONE_VERIFICATION_RESUME_ON` is the date it goes back on; it only drives
   * the reminder in the logs, so turning it back on is still a deliberate act:
   * remove PHONE_VERIFICATION_REQUIRED=false from the environment.
   */
  auth: {
    phoneVerificationRequired: process.env.PHONE_VERIFICATION_REQUIRED !== 'false',
    phoneVerificationResumeOn: process.env.PHONE_VERIFICATION_RESUME_ON || '',
    /**
     * How many accounts one address may create per day. Shared mobile gateways
     * put many real people behind one address in Cameroon, so this is a brake
     * on bulk automation, not a per-person limit.
     */
    signupsPerIpPerDay: Number(process.env.SIGNUPS_PER_IP_PER_DAY) || 10,
  },

  email: {
    host: process.env.EMAIL_HOST || '',
    port: Number(process.env.EMAIL_PORT) || 587,
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    // Sender display name - always falls back to "BiZik" (even if the env var
    // is blank or whitespace) so every email is sent from "BiZik <…>".
    fromName: (process.env.FROM_NAME || '').trim() || 'BiZik',
    fromEmail: process.env.FROM_EMAIL || 'no-reply@bizik.cm',
  },

  /**
   * Twilio SMS delivery - the phone-first identity model sends verification
   * codes and deal invites by SMS. When credentials are unset the sender falls
   * back to logging the message (like the SMTP "disabled" fallback), so the
   * flow works end-to-end in development without live Twilio.
   */
  /**
   * Which SMS rail to try first: 'orange', 'twilio', or 'auto' (the default),
   * which sends Cameroon numbers through Orange and everything else through
   * Twilio, each falling back to the other.
   */
  smsProvider: (process.env.SMS_PROVIDER || 'auto').trim().toLowerCase(),

  /**
   * Orange SMS API (SMS Cameroon / Africa & Middle East). Credentials come from
   * the application's page on developer.orange.com. Sending draws down a
   * prepaid bundle, so it stops when the bundle empties or expires.
   */
  orangeSms: {
    clientId: process.env.ORANGE_SMS_CLIENT_ID || '',
    clientSecret: process.env.ORANGE_SMS_CLIENT_SECRET || '',
    /**
     * The country gateway address, which Orange requires both in the request
     * body and URL-encoded in the path. Cameroon is `tel:+2370000`, exactly as
     * Orange's own code sample shows.
     *
     * Do NOT put the short code from "Authorized senders" here. That number
     * (e.g. 587659) is the sender NAME recipients see, which Orange applies
     * automatically; it is not an address and the API rejects it as one.
     */
    senderAddress: process.env.ORANGE_SMS_SENDER_ADDRESS || 'tel:+2370000',
    /**
     * A CUSTOM sender name, and only one Orange has whitelisted for this
     * account. Left empty the account's default name is used; sending an
     * unapproved name is rejected with 400, so this stays empty until the
     * local Orange team approves one.
     */
    senderName: process.env.ORANGE_SMS_SENDER_NAME || '',
    /**
     * Only set with an "Orange only" bundle, which cannot reach other
     * operators. Check `offerName` on the contract (the boot log prints the
     * bundle): `SMS_OCB` is the ordinary all-operator offer and wants this
     * FALSE; only `SMS_OCB2` wants it true. Setting it on an SMS_OCB bundle
     * asks Orange for an offer the account does not hold.
     */
    onNetOnly: process.env.ORANGE_SMS_ONNET === 'true',
    /** Warn when the remaining bundle falls below this many messages. */
    /**
     * Public HTTPS URL of THIS server's Orange delivery-receipt endpoint.
     *
     * Orange answers 201 when it ACCEPTS a message, never when it arrives, and
     * offers no way to ask afterwards (the per-message endpoints answer 405).
     * Asking for a receipt on each send is therefore the only way to learn that
     * a message was accepted, billed and then dropped - the documented symptom
     * of a sender name that is not whitelisted.
     *
     * Empty disables the request, which is right for local development: Orange
     * must be able to reach the URL from the internet.
     */
    receiptUrl: process.env.ORANGE_SMS_RECEIPT_URL || '',
    lowBalanceThreshold: Number(process.env.ORANGE_SMS_LOW_BALANCE) || 25,
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    // Auth via EITHER an API Key (SID starting with "SK" + secret) OR the
    // account Auth Token. API keys are preferred (revocable, scoped).
    apiKeySid: process.env.TWILIO_API_KEY_SID || '',
    apiKeySecret: process.env.TWILIO_API_KEY_SECRET || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    // Sender: EITHER a single From number OR a Messaging Service (MG…) that
    // manages the sender pool, geo-routing and Sender IDs. The Messaging Service
    // wins when set (recommended for international SMS, e.g. +237/+234).
    from: process.env.TWILIO_FROM || '',
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
    get usingApiKey() {
      return !!(this.apiKeySid && this.apiKeySecret);
    },
    get hasSender() {
      return !!(this.messagingServiceSid || this.from);
    },
    get enabled() {
      const hasCreds = this.usingApiKey || !!this.authToken;
      // Needs the account SID, some auth, and a sender (number or service).
      return !!(this.accountSid && this.hasSender && hasCreds);
    },
  },
} as const;

/**
 * Surface insecure default secrets at startup. Signing/encryption keys that fall
 * back to their `dev-*-change-me` placeholders make JWTs forgeable and KYC PII
 * decryptable by anyone with the source. By default (incl. the dev-style
 * `NODE_ENV=production` box) this only WARNS loudly so it never bricks a running
 * environment; set `ENFORCE_PROD_SECRETS=true` in a real production deploy to
 * turn the warning into a hard refusal-to-boot.
 */
export function assertProductionSecrets(): void {
  const offenders: string[] = [];
  if (config.jwt.accessSecret === 'dev-access-secret-change-me') offenders.push('JWT_ACCESS_SECRET');
  if (config.jwt.refreshSecret === 'dev-refresh-secret-change-me') offenders.push('JWT_REFRESH_SECRET');
  if (config.kyc.encKey === 'dev-kyc-encryption-key-change-me') offenders.push('KYC_ENC_KEY');
  if (!config.databaseUrl) offenders.push('DATABASE_URL');
  // A live WhatsApp channel without its app secret cannot authenticate Meta,
  // and that webhook can act on any phone number it is handed.
  if (config.whatsapp.enabled && !config.whatsapp.appSecret) offenders.push('WHATSAPP_APP_SECRET');
  // A live money mode with a half-configured rail is the dangerous combination:
  // the factory would hand back the simulator, which reports success without
  // moving money. Name every missing piece so a deploy fails loudly instead.
  if (config.payments.mode === 'live') {
    if (!config.payments.fapshi.apiUser) offenders.push('FAPSHI_API_USER');
    if (!config.payments.fapshi.apiKey) offenders.push('FAPSHI_API_KEY');
    if (!config.payments.fapshi.webhookSecret) offenders.push('FAPSHI_WEBHOOK_SECRET');
    if (config.payments.fapshi.environment !== 'live') offenders.push('FAPSHI_ENVIRONMENT (expected "live")');
    // A Fapshi service is collection OR disbursement, so the same credentials
    // cannot do both: pasting the collection key into the payout slots means
    // every payout is refused. Cheap to check, confusing to debug.
    const { apiUser, apiKey, payoutApiUser, payoutApiKey } = config.payments.fapshi;
    if (payoutApiUser && payoutApiUser === apiUser && payoutApiKey === apiKey) {
      offenders.push('FAPSHI_PAYOUT_API_USER/KEY (must be the DISBURSEMENT service, not the collection one)');
    }
  }
  if (offenders.length === 0) return;

  const message =
    `Insecure/missing secrets in use: ${offenders.join(', ')}. ` +
    'Set strong values before serving real users.';
  if (process.env.ENFORCE_PROD_SECRETS === 'true') {
    throw new Error(`Refusing to start - ${message}`);
  }
  console.warn(`[security] ⚠ ${message} (set ENFORCE_PROD_SECRETS=true to make this fatal)`);
}
