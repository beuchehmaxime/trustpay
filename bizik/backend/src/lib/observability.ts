/**
 * Error capture and alerting.
 *
 * Before this, observability was `docker compose logs` on a single host, read
 * by hand. Nothing detected an incident, nothing paged anyone, and nothing
 * produced the evidence that monitoring happens at all - which is SOC 2 CC7.2
 * and CC7.3, ISO 27001 A.8.15 and A.8.16, and the reason a GDPR 72-hour breach
 * notification would have been impossible to meet for a breach nobody noticed.
 *
 * Three levels, deliberately, so that adding a monitoring service later is a
 * configuration change rather than a rewrite:
 *
 *  1. ALWAYS log, structured, with a stable prefix so it can be grepped and
 *     later shipped to any log aggregator.
 *  2. For anything that means money or compliance broke, raise an in-product
 *     admin notification. That reaches a human today, on the infrastructure
 *     that already exists, with no third-party account and no new bill.
 *  3. If SENTRY_DSN is set, forward there too. The import is lazy and optional:
 *     with no DSN and no package installed, this module does nothing extra and
 *     costs nothing.
 */

/** What kind of failure this is, which decides who hears about it. */
export type ErrorSeverity =
  /** Something a user hit. Logged, counted, not escalated. */
  | 'handled'
  /** An unexpected server fault. Logged and forwarded. */
  | 'error'
  /** Money, compliance or auth broke. A person is told, in-product. */
  | 'critical';

export interface ErrorContext {
  /** Where it happened, e.g. 'payments.withdraw' - used as the alert title. */
  scope: string;
  severity?: ErrorSeverity;
  /** Anything that helps diagnose. Never put secrets or card-like data here. */
  extra?: Record<string, unknown>;
  /** The affected account, when there is one. */
  userId?: string;
}

let sentryClient: { captureException: (error: unknown, hint?: unknown) => void } | null = null;
let sentryTried = false;

/**
 * Load Sentry once, only if configured AND installed.
 *
 * Lazy rather than a top-level import so the dependency is genuinely optional:
 * a deployment with no DSN never loads it, and one without the package
 * installed degrades to logging rather than failing to boot.
 */
async function sentry(): Promise<typeof sentryClient> {
  if (sentryTried) return sentryClient;
  sentryTried = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;
  try {
    // The specifier is a variable on purpose: TypeScript resolves a literal
    // import at compile time and would fail the build because the package is
    // not installed. Keeping it optional is the point - a deployment that does
    // not use Sentry should not have to carry it.
    const specifier = '@sentry/node';
    const mod = (await import(specifier)) as unknown as {
      init: (options: Record<string, unknown>) => void;
      captureException: (error: unknown, hint?: unknown) => void;
    };
    mod.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      // Errors only by default. Performance tracing on a single small VPS costs
      // more than it tells you, and can be turned on deliberately later.
      tracesSampleRate: 0,
    });
    sentryClient = { captureException: mod.captureException };
    console.log('[observability] Sentry enabled');
  } catch {
    console.warn(
      '[observability] SENTRY_DSN is set but @sentry/node is not installed - ' +
        'run `npm i @sentry/node` in backend/ to enable it. Errors are still logged.',
    );
  }
  return sentryClient;
}

/**
 * Record a failure.
 *
 * Never throws and never awaits anything the caller depends on: an error in the
 * error path must not become a second incident. Call it and move on.
 */
export function captureError(error: unknown, context: ErrorContext): void {
  const severity = context.severity ?? 'error';
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const detail = context.extra ? ` ${safeJson(context.extra)}` : '';
  const line = `[error] ${context.scope} (${severity}): ${message}${detail}`;
  if (severity === 'handled') console.warn(line);
  else console.error(line, stack ?? '');

  void (async () => {
    try {
      const client = await sentry();
      client?.captureException(error, {
        tags: { scope: context.scope, severity },
        user: context.userId ? { id: context.userId } : undefined,
        extra: context.extra,
      });
    } catch {
      // Monitoring the monitoring is where this stops.
    }

    // Only the critical class pages a person. An operator inbox that fills with
    // routine faults is one nobody reads, and an unread alert channel is worse
    // than none because it looks like coverage.
    if (severity !== 'critical') return;
    try {
      const { emitAdminEvent } = await import('./admin-events');
      await emitAdminEvent({
        type: 'SYSTEM',
        severity: 'CRITICAL',
        title: `Failure in ${context.scope}`,
        body: `${message}${detail}`.slice(0, 500),
        permission: null,
      });
    } catch {
      // The database may be the thing that is broken; the log line above
      // already carries the failure.
    }
  })();
}

/** Serialise context without letting a circular object break the log line. */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserialisable context]';
  }
}

/**
 * Catch what escapes everything else.
 *
 * These were a bare `console.error` on a host nobody watches. An uncaught
 * exception in a process that moves money is exactly the event that must leave
 * a trace somewhere a person will see.
 */
export function installProcessErrorHandlers(): void {
  // A rejected fire-and-forget promise is recorded but NOT fatal: a failed
  // background send must not take down a process that is serving payments.
  process.on('unhandledRejection', (reason) => {
    captureError(reason, { scope: 'process.unhandledRejection', severity: 'critical' });
  });

  // An uncaught exception is different. It leaves the process in a state nobody
  // reasoned about, and carrying on in that state while moving money is worse
  // than stopping - so capture it, give the capture a moment to leave the
  // machine, then exit and let Docker restart cleanly.
  process.on('uncaughtException', (error) => {
    captureError(error, { scope: 'process.uncaughtException', severity: 'critical' });
    setTimeout(() => process.exit(1), 1000).unref();
  });
}

/** Whether an external monitoring service is actually receiving anything. */
export function observabilityStatus(): string {
  if (!process.env.SENTRY_DSN) {
    return 'local logs + in-product admin alerts (no external monitoring configured)';
  }
  return sentryClient ? 'Sentry + in-product admin alerts' : 'Sentry configured but not loaded';
}

