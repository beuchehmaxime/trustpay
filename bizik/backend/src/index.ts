import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

import { config } from './config/env';
import { errorMiddleware } from './lib/errors';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { systemSettings } from './lib/system-settings';
import authRoutes from './auth/auth.routes';
import kycRoutes from './kyc/kyc.routes';
import complianceRoutes from './compliance/compliance.routes';
import userRoutes from './user/user.routes';
import contractRoutes from './contract/contract.routes';
import fileRoutes from './file/file.routes';
import escrowRoutes from './escrow/escrow.routes';
import paymentRoutes from './payment/payment.routes';
import paymentsRoutes from './payments/presentation/payment.routes';
import walletRoutes from './wallet/wallet.routes';
import fxRoutes from './fx/fx.routes';
import disputeRoutes from './dispute/dispute.routes';
import notificationRoutes from './notification/notification.routes';
import adminRoutes from './admin/admin.routes';
import insightsRoutes from './insights/insights.routes';
import whatsappAdminRoutes from './whatsappadmin/whatsappadmin.routes';
import rbacRoutes from './rbac/rbac.routes';
import userAdminRoutes from './useradmin/useradmin.routes';
import amlRoutes from './aml/aml.routes';
import projectsRoutes from './projects/projects.routes';
import escrowAdminRoutes from './escrowadmin/escrowadmin.routes';
import walletAdminRoutes from './walletadmin/walletadmin.routes';
import feesAdminRoutes from './feesadmin/feesadmin.routes';
import disputeAdminRoutes from './disputeadmin/disputeadmin.routes';
import auditAdminRoutes from './auditadmin/auditadmin.routes';
import analyticsRoutes from './analytics/analytics.routes';
import adminNotifyRoutes from './adminnotify/adminnotify.routes';
import dormancyRoutes from './retention/dormancy.routes';
import settingsAdminRoutes from './settingsadmin/settingsadmin.routes';
import dashboardRoutes from './dashboard/dashboard.routes';
import supportRoutes from './support/support.routes';
import supportAdminRoutes from './supportadmin/supportadmin.routes';
import contentRoutes from './content/content.routes';
import blogAdminRoutes from './content/blogadmin.routes';
import reportingRoutes from './reporting/reporting.routes';
import transferRoutes from './transfer/transfer.routes';
import analyticsIngestRoutes from './analytics/ingest.routes';
import smsRoutes from './sms/sms.routes';
import whatsappRoutes from './whatsapp/whatsapp.routes';
import assistantRoutes from './assistant/assistant.routes';

dotenv.config();

const app = express();

// Behind the nginx reverse proxy - trust the first hop so client IPs
// (X-Forwarded-For) are read correctly for rate limiting and logging.
app.set('trust proxy', 1);

// Configure Rate Limiting with the shared Redis store (SRS NFR-SEC-009).
// NOTE: a single screen load fans out several requests, so the window is kept
// generous for development. Tighten per-route (e.g. 10/min on financial
// endpoints) when hardening for production.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.sendCommand(args),
    // Distinct prefix per limiter. Without it all limiters share `rl:<ip>`, and
    // the first one to create that key sets the window for the others: one POST
    // to the 60-second WhatsApp limiter would shrink the 15-minute auth window
    // to 60 seconds, multiplying the brute-force budget by 15.
    prefix: 'rl:api:',
  }),
});

// Security headers (HSTS, no-sniff, frame options, etc.). This is a JSON API
// behind nginx, so the browser-page-oriented CSP/COEP defaults are disabled.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// Reads the httpOnly refresh cookie browser clients use instead of keeping a
// 90-day token in localStorage (see auth/refresh-cookie.ts).
app.use(cookieParser());

// CORS restricted to the known browser origins (user PWA + admin console).
// Requests with no Origin header (mobile apps, curl, server-to-server) are
// allowed; unlisted browser origins are rejected.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  }),
);
// Orange delivery receipts, mounted BEFORE the generous parser below so they
// get a 16 KB limit instead of 20 MB. The endpoint is public - Orange neither
// signs nor authenticates delivery receipts - so anyone who finds the URL can
// post to it, and there is no reason for that to cost 20 MB of parsing.
// `express.json` skips a request whose body another parser already read.
//
// Mounting here also puts it ahead of the general limiter further down, so it
// carries its own: a public endpoint with no rate limit at all is an unmetered
// way to make this server do work. Orange's real volume is one receipt per
// message sent, which is nowhere near this.
const smsWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.SMS_WEBHOOK_RATE_LIMIT_PER_MIN) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.sendCommand(args),
    prefix: 'rl:sms:',
  }),
});
app.use('/api/v1/sms', smsWebhookLimiter, express.json({ limit: '16kb' }), smsRoutes);

// Visitor analytics ingest. Public and anonymous by necessity: most of the
// funnel happens before anyone signs up, so an endpoint that required a session
// could only measure the people who already converted.
//
// Mounted here with its own small body limit and its own limiter. A browser
// sends a handful of events a minute; anything far above that is either a bug
// in a client loop or someone filling the table, and neither should be able to
// use the 20 MB parser the KYC upload path needs.
const analyticsIngestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.ANALYTICS_RATE_LIMIT_PER_MIN) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.sendCommand(args),
    prefix: 'rl:analytics:',
  }),
});
app.use(
  '/api/v1/events',
  analyticsIngestLimiter,
  express.json({ limit: '32kb' }),
  analyticsIngestRoutes,
);

// Generous body limit so base64-encoded KYC documents (ID photos + selfie)
// fit in a single JSON request (SRS MOD-02). Tighten per-route if needed.
app.use(
  express.json({
    limit: '20mb',
    // Capture the raw body so the WhatsApp webhook can verify Meta's
    // X-Hub-Signature-256 HMAC over the exact bytes.
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

// WhatsApp Assistant webhook - mounted BEFORE the global rate limiter so Meta's
// deliveries are never throttled by ordinary API traffic, and outside
// USER_NAMESPACES so maintenance mode doesn't block inbound messages. It gets
// its OWN generous limiter: the endpoint is public by design, so it must not be
// an unmetered way to make this server do work. Meta's real volume (messages +
// delivery receipts + retries) stays far below this.
const whatsappLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.WHATSAPP_RATE_LIMIT_PER_MIN) || 600,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.sendCommand(args),
    prefix: 'rl:whatsapp:',
  }),
});
// Mounted at both paths so either callback URL configured in Meta resolves.
app.use('/api/v1/whatsapp', whatsappLimiter, whatsappRoutes);
app.use('/api/v1/communication/whatsapp', whatsappLimiter, whatsappRoutes);

// Liveness/readiness probe (used by Docker healthchecks + nginx) - kept
// before the rate limiter so monitoring traffic is never throttled. Pings both
// Redis and Postgres so a DB outage is reflected instead of reporting "ok".
app.get('/health', async (_req, res) => {
  let database = 'down';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'up';
  } catch {
    database = 'down';
  }
  const redisUp = redis.isReady;
  res.status(database === 'up' && redisUp ? 200 : 503).json({
    status: database === 'up' && redisUp ? 'ok' : 'degraded',
    service: 'bizik-backend',
    redis: redisUp ? 'up' : 'down',
    database,
    timestamp: new Date().toISOString(),
  });
});

app.use(apiLimiter); // Apply rate limiter to all requests

// Public platform config (branding, open markets, maintenance banner) that the
// client apps read at startup. Reflects live system settings.
app.get('/api/v1/config', (_req, res) => {
  const settings = systemSettings();
  res.json({
    platformName: settings.general.platformName,
    supportEmail: settings.general.supportEmail,
    defaultLocale: settings.general.defaultLocale,
    defaultCurrency: settings.markets.defaultCurrency,
    maintenanceMode: settings.general.maintenanceMode,
    maintenanceMessage: settings.general.maintenanceMessage,
    currencies: settings.markets.currencies.filter((currency) => currency.enabled),
    countries: settings.markets.countries.filter((country) => country.enabled),
  });
});

/**
 * Maintenance mode: when enabled in settings, end-user API namespaces return a
 * 503 with the configured message. Auth, the admin console and reporting stay
 * open so operators can keep working and toggle maintenance back off.
 */
const USER_NAMESPACES = [
  '/api/v1/kyc',
  '/api/v1/user',
  '/api/v1/contract',
  '/api/v1/file',
  '/api/v1/escrow',
  '/api/v1/payment',
  '/api/v1/wallet',
  '/api/v1/fx',
  '/api/v1/disputes',
  '/api/v1/notification',
  '/api/v1/support',
];
app.use((req, res, next) => {
  const general = systemSettings().general;
  if (general.maintenanceMode && USER_NAMESPACES.some((namespace) => req.path.startsWith(namespace))) {
    return res.status(503).json({
      code: 'Q-503',
      message: general.maintenanceMessage || 'BiZik is temporarily unavailable for maintenance.',
    });
  }
  next();
});

// Register routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/compliance', complianceRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/contract', contractRoutes);
app.use('/api/v1/file', fileRoutes);
app.use('/api/v1/escrow', escrowRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/transfer', transferRoutes);
app.use('/api/v1/fx', fxRoutes);
app.use('/api/v1/disputes', disputeRoutes);
app.use('/api/v1/notification', notificationRoutes);
app.use('/api/v1/support', supportRoutes);
// The in-app assistant. Its /chat limiter lives inside the router rather than
// here, because it has to run AFTER requireAuth to see who is asking.
app.use('/api/v1/assistant', assistantRoutes);
// Public marketing content (blog / help / legal) - no auth.
app.use('/api/v1', contentRoutes);
app.use('/api/v1/insights', insightsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/whatsapp', whatsappAdminRoutes);
app.use('/api/v1/admin', rbacRoutes);
app.use('/api/v1/admin', userAdminRoutes);
app.use('/api/v1/admin', amlRoutes);
app.use('/api/v1/admin', projectsRoutes);
app.use('/api/v1/admin', escrowAdminRoutes);
app.use('/api/v1/admin', walletAdminRoutes);
app.use('/api/v1/admin', feesAdminRoutes);
app.use('/api/v1/admin', disputeAdminRoutes);
app.use('/api/v1/admin', auditAdminRoutes);
app.use('/api/v1/admin', analyticsRoutes);
app.use('/api/v1/admin', adminNotifyRoutes);
app.use('/api/v1/admin', dormancyRoutes);
app.use('/api/v1/admin', settingsAdminRoutes);
app.use('/api/v1/admin', blogAdminRoutes);
app.use('/api/v1/admin', dashboardRoutes);
app.use('/api/v1/admin', supportAdminRoutes);
app.use('/api/v1/reporting', reportingRoutes);

// Unknown route fallback (consistent JSON error shape).
app.use((_req, res) => {
  res.status(404).json({ code: 'Q-404', message: 'Resource not found' });
});

// Terminal error handler (renders AppError / ZodError -> BiZik error shape).
app.use(errorMiddleware);

export default app;
