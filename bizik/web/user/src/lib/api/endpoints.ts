/**
 * Central registry of REST endpoint paths, grouped by backend module (SRS §7.2).
 * Mirrors the mobile app's endpoint map so both clients stay in lockstep with
 * the gateway. Keep in sync with `application/backend/src/index.ts` route mounts.
 */
export const endpoints = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    forgotPassword: '/auth/forgot-password',
    resetPasswordVerify: '/auth/reset-password/verify',
    resetPassword: '/auth/reset-password',
    changePassword: '/auth/change-password',
    verify2fa: '/auth/2fa/verify',
    verifyPhone: '/auth/verify-phone',
    resendCode: '/auth/resend-code',
    me: '/auth/me',
    freelancerActivate: '/auth/freelancer/activate',
    sessions: '/auth/sessions',
    session: (id: string) => `/auth/sessions/${id}`,
    twoFactorSetup: '/auth/2fa/setup',
    twoFactorEnable: '/auth/2fa/enable',
    twoFactorDisable: '/auth/2fa/disable',
  },
  user: {
    me: '/user/me',
    lookup: '/user/lookup',
    // The account owner's controls over their own WhatsApp channel.
    whatsapp: '/user/me/whatsapp',
    whatsappLock: '/user/me/whatsapp/lock',
    whatsappUnlock: '/user/me/whatsapp/unlock',
    whatsappPinReset: '/user/me/whatsapp/pin/reset',
  },
  // Wallet-to-wallet money between BiZik users, addressed by @handle.
  transfer: {
    me: '/transfer/me',
    handle: '/transfer/me/handle',
    lookup: '/transfer/lookup',
    list: '/transfer',
    byId: (id: string) => `/transfer/${id}`,
  },
  kyc: {
    status: '/kyc/status',
    submit: '/kyc/submit',
    document: '/kyc/document',
  },
  /** Enabled markets, served from the platform's own settings. Public. */
  countries: '/countries',
  contracts: {
    list: '/contract',
    byId: (id: string) => `/contract/${id}`,
    accept: (id: string) => `/contract/${id}/accept`,
    decline: (id: string) => `/contract/${id}/decline`,
    complete: (id: string) => `/contract/${id}/complete`,
    editCounterparty: (id: string) => `/contract/${id}/counterparty`,
    addMilestone: (id: string) => `/contract/${id}/milestones`,
    submitWork: (milestoneId: string) => `/contract/milestones/${milestoneId}/submit`,
    revise: (milestoneId: string) => `/contract/milestones/${milestoneId}/revise`,
    cancel: (id: string) => `/contract/${id}/cancel`,
    remind: (id: string) => `/contract/${id}/remind`,
    receiptToken: (id: string) => `/contract/${id}/receipt-token`,
    receipt: (id: string) => `/contract/${id}/receipt`,
    cancelMilestone: (milestoneId: string) => `/contract/milestones/${milestoneId}/cancel`,
    editMilestone: (milestoneId: string) => `/contract/milestones/${milestoneId}`,
    deleteMilestone: (milestoneId: string) => `/contract/milestones/${milestoneId}`,
    templates: '/contract/templates',
  },
  escrow: {
    fundMilestone: (milestoneId: string) => `/escrow/milestones/${milestoneId}/fund`,
    fundFromNumber: (milestoneId: string) => `/escrow/milestones/${milestoneId}/fund-from-number`,
    fundingQuote: (milestoneId: string) => `/escrow/milestones/${milestoneId}/funding-quote`,
    releaseMilestone: (milestoneId: string) => `/escrow/milestones/${milestoneId}/release`,
    disputeMilestone: (milestoneId: string) => `/escrow/milestones/${milestoneId}/dispute`,
    summary: (contractId: string) => `/escrow/contract/${contractId}`,
  },
  wallet: {
    overview: '/wallet/overview',
    transactions: '/wallet/transactions',
    receiptToken: (reference: string) =>
      `/wallet/transactions/${encodeURIComponent(reference)}/receipt-token`,
    receipt: (reference: string, token: string) =>
      `/wallet/transactions/${encodeURIComponent(reference)}/receipt?rt=${encodeURIComponent(token)}`,
    payout: '/wallet/payout',
    fxRate: '/fx/rate',
    payoutMethods: '/wallet/payout-methods',
    payoutMethod: (id: string) => `/wallet/payout-methods/${id}`,
    payoutMethodDefault: (id: string) => `/wallet/payout-methods/${id}/default`,
    payoutMethodVerifyStart: '/wallet/payout-methods/verify/start',
    payoutMethodVerifyConfirm: '/wallet/payout-methods/verify/confirm',
    payoutMethodVerifyResend: '/wallet/payout-methods/verify/resend',
    addFunds: '/wallet/add-funds',
    /** What a top-up or withdrawal costs, before anything is charged. */
    transferQuote: '/wallet/transfer-quote',
    convert: '/wallet/convert',
  },
  payments: {
    deposits: '/payments/deposits',
    withdrawals: '/payments/withdrawals',
    transaction: (id: string) => `/payments/transactions/${id}`,
  },
  disputes: {
    list: '/disputes',
    byId: (id: string) => `/disputes/${id}`,
    messages: (id: string) => `/disputes/${id}/messages`,
    evidence: (id: string) => `/disputes/${id}/evidence`,
    resolve: (id: string) => `/disputes/${id}/resolve`,
    withdraw: (id: string) => `/disputes/${id}/withdraw`,
  },
  profile: {
    me: '/profile/me',
    byUsername: (username: string) => `/profile/${username}`,
  },
  notifications: {
    list: '/notification',
    unreadCount: '/notification/unread-count',
    read: (id: string) => `/notification/${id}/read`,
    readAll: '/notification/read-all',
    preferences: '/notification/preferences',
    registerPushToken: '/notification/push-token',
  },
  support: {
    help: '/support/help',
    tickets: '/support/tickets',
    ticket: (id: string) => `/support/tickets/${id}`,
    reply: (id: string) => `/support/tickets/${id}/reply`,
  },
  // The in-app assistant. `confirm` is the only one of these that can move
  // money, and it takes a proposal id rather than an action: the server already
  // knows what it offered.
  assistant: {
    status: '/assistant/status',
    history: '/assistant/history',
    chat: '/assistant/chat',
    confirm: '/assistant/confirm',
    cancel: '/assistant/cancel',
    pin: '/assistant/pin',
    reset: '/assistant/reset',
  },
} as const;
