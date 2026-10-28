import { assertProductionSecrets, config } from './config/env';
import { installProcessErrorHandlers } from './lib/observability';
import { connectRedis } from './lib/redis';

// Capture (never crash on) stray async failures so a rejected fire-and-forget
// promise or background job can't silently destabilise the process. An uncaught
// exception leaves the process in an unknown state, so it is captured and the
// process exits for the orchestrator (Docker/nginx) to restart cleanly.
//
// These used to be a bare `console.error` on a host nobody watches, which is
// the same as having no detection at all.
installProcessErrorHandlers();

async function start() {
  // Refuse to boot in production with default/missing secrets.
  assertProductionSecrets();

  // Connect Redis FIRST so the rate-limiter store (initialised when the app
  // module is evaluated) has a live client. The app is imported dynamically so
  // its module-level side-effects run only after the connection is ready.
  await connectRedis();

  const { default: app } = await import('./index');

  // RBAC bootstrap - ensure the Super Admin role exists and is assigned.
  const { seedRbac } = await import('./lib/rbac-seed');
  await seedRbac().catch((e) => console.error('[rbac] seed failed', (e as Error).message));

  // Notification templates + a demonstrable moderation queue.
  const { seedNotificationTemplates, seedModerationSamples } = await import('./lib/notifications-seed');
  await seedNotificationTemplates().catch((e) =>
    console.error('[notifications] template seed failed', (e as Error).message),
  );
  await seedModerationSamples().catch((e) =>
    console.error('[notifications] moderation seed failed', (e as Error).message),
  );

  // Load editable pricing (fees, margins, FX rates) into the in-memory cache.
  const { loadSettings } = await import('./lib/settings');
  await loadSettings().catch((e) => console.error('[settings] load failed', (e as Error).message));

  // Live FX feed - real mid-market rates (falls back to configured rates if down).
  const { startLiveFxFeed } = await import('./lib/fx-feed');
  startLiveFxFeed();

  // System settings (general/markets/verification/providers) + legal content.
  const { seedLegalDocuments } = await import('./lib/legal-seed');
  await seedLegalDocuments().catch((e) =>
    console.error('[settings] legal seed failed', (e as Error).message),
  );
  const { loadSystemSettings } = await import('./lib/system-settings');
  await loadSystemSettings().catch((e) =>
    console.error('[settings] system load failed', (e as Error).message),
  );

  // Help-center articles + a demonstrable support queue.
  const { seedHelpArticles, seedSupportTickets } = await import('./lib/support-seed');
  await seedHelpArticles().catch((e) =>
    console.error('[support] help seed failed', (e as Error).message),
  );
  await seedSupportTickets().catch((e) =>
    console.error('[support] ticket seed failed', (e as Error).message),
  );

  // Public marketing content - blog posts, help-centre articles, legal docs.
  const { seedContent } = await import('./content/content-seed');
  await seedContent().catch((e) => console.error('[content] seed failed', (e as Error).message));

  // Background email worker (BullMQ) - delivers queued mail (e.g. staff MFA codes).
  const { startEmailWorker } = await import('./lib/email-worker');
  startEmailWorker();

  // A WhatsApp campaign delivers from inside this process, so a restart midway
  // through one would otherwise abandon whoever had not been messaged yet.
  const { CampaignService } = await import('./whatsappadmin/campaign.service');
  await CampaignService.resumeInterrupted().catch((error) =>
    console.error('[campaign] resume check failed', (error as Error).message),
  );

  // Recurring schedules (weekly user digest) - BullMQ repeatable jobs.
  const { registerSchedules, startSchedulerWorker } = await import('./lib/scheduler');
  startSchedulerWorker();
  await registerSchedules().catch((e) =>
    console.error('[scheduler] register failed', (e as Error).message),
  );

  // Say out loud whether anything is actually watching this process. "We have
  // monitoring" should never be a belief; the boot banner states it.
  const { observabilityStatus } = await import('./lib/observability');
  console.log(`[observability] ${observabilityStatus()}`);

  // Announce the active payment mode so it's obvious whether real providers are
  // engaged. In `live` mode a provider is only used when its creds are present.
  const { PaymentProviderFactory } = await import('./payments/application/payment-provider.factory');
  console.log(`[payments] mode=${config.payments.mode} - ${PaymentProviderFactory.describe()}`);

  // Which SMS rail is live. A silently unconfigured (or empty) rail is how a
  // month of verification codes went missing, so it is stated at boot.
  const { smsProviderStatus, orangeSms } = await import('./lib/sms');
  const rails = smsProviderStatus()
    .map((rail) => `${rail.name}=${rail.configured ? 'ready' : 'not configured'}${rail.preferred ? '*' : ''}`)
    .join(' ');
  console.log(`[sms] ${rails} (preference=${config.smsProvider})`);
  if (orangeSms.isConfigured()) {
    // State the sender address out loud. It has to be the short code Orange
    // authorised for THIS account, and a wrong one is rejected with a 400 that
    // names nothing useful - so the value is worth seeing next to the balance.
    console.log(
      `[sms] Orange sender=${config.orangeSms.senderAddress}` +
        ` name=${config.orangeSms.senderName || '(none - correct unless Orange whitelisted one)'}`,
    );
    // Bundles expire and run out; when they do, sending just stops.
    void orangeSms
      .balance()
      .then((contracts) => {
        for (const contract of contracts) {
          const low = contract.availableUnits <= config.orangeSms.lowBalanceThreshold;
          const message =
            `[sms] Orange bundle ${contract.country} (${contract.offerName}):` +
            ` ${contract.availableUnits} units, ${contract.status},` +
            ` expires ${contract.expirationDate ?? 'unknown'}`;
          if (low || contract.status !== 'ACTIVE') console.warn(`${message} - TOP UP SOON`);
          else console.log(message);
        }
      })
      .catch((error: Error) => console.warn(`[sms] could not read the Orange balance: ${error.message}`));
  }

  // A platform where anyone can claim any phone number is a temporary state,
  // not a configuration - so it announces itself on every single boot, and says
  // so louder once the date it was meant to end has passed.
  if (!config.auth.phoneVerificationRequired) {
    const resumeOn = config.auth.phoneVerificationResumeOn;
    const overdue = resumeOn && new Date(resumeOn).getTime() < Date.now();
    console.warn(
      `[security] ⚠ PHONE VERIFICATION IS OFF - new accounts are created without proving the number.` +
        (resumeOn
          ? overdue
            ? ` This was due to end on ${resumeOn}. IT IS OVERDUE: remove PHONE_VERIFICATION_REQUIRED=false now.`
            : ` Scheduled to resume on ${resumeOn}.`
          : ' No resume date set (PHONE_VERIFICATION_RESUME_ON).'),
    );
  }

  const httpServer = app.listen(config.port, () => {
    console.log(`BiZik Backend Server running on port ${config.port}`);
  });

  // Attach the realtime gateway (Socket.io) to the same HTTP server.
  const { initRealtime } = await import('./lib/realtime');
  initRealtime(httpServer);

  // Inspection-period scheduler (SRS FR-PAY-005): periodically release any
  // submitted milestone whose inspection window has elapsed without action.
  if (config.escrow.autoReleaseIntervalMs > 0) {
    const { EscrowService } = await import('./escrow/escrow.service');
    setInterval(() => {
      EscrowService.tickAutoReleases().catch((e) =>
        console.error('[escrow] auto-release tick failed', (e as Error).message),
      );
    }, config.escrow.autoReleaseIntervalMs);
  }
}

start().catch((err) => {
  console.error('[startup] failed to start server', err);
  process.exit(1);
});
