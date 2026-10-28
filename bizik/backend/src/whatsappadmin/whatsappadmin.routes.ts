import { Router } from 'express';

import { asyncHandler } from '../lib/errors';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { systemSettings } from '../lib/system-settings';
import { SettingsAdminService } from '../settingsadmin/settingsadmin.service';
import { CampaignService } from './campaign.service';
import { sendCampaignSchema } from './campaign.validation';
import { WhatsAppAdminService } from './whatsappadmin.service';
import {
  conversationThread,
  listConversations,
  type ConversationFilter,
} from './whatsapp-conversations';

/**
 * Operator view of the WhatsApp channel: what it is doing, and one switch to
 * stop it. Read and control are separate permissions so support staff can watch
 * the channel without being able to take it down.
 */
const router = Router();

router.get(
  '/overview',
  requireAuth,
  requirePermission('whatsapp.view'),
  asyncHandler(async (req, res) => {
    const days = Math.min(Number(req.query.days) || 14, 60);
    res.json(await WhatsAppAdminService.overview(days));
  }),
);

router.get(
  '/messages',
  requireAuth,
  requirePermission('whatsapp.view'),
  asyncHandler(async (req, res) => {
    res.json(await WhatsAppAdminService.recent(Number(req.query.limit) || 50));
  }),
);

/**
 * Conversations, not a firehose: one row per contact, searchable and
 * filterable, so the page stays readable however busy the channel gets.
 */
router.get(
  '/conversations',
  requireAuth,
  requirePermission('whatsapp.view'),
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const filter = typeof req.query.filter === 'string' ? req.query.filter : undefined;
    res.json(
      await listConversations({
        search,
        filter: filter as ConversationFilter | undefined,
        limit: Number(req.query.limit) || 25,
        offset: Number(req.query.offset) || 0,
      }),
    );
  }),
);

/** One contact's thread. The id is opaque - never the phone number itself. */
router.get(
  '/conversations/:id/messages',
  requireAuth,
  requirePermission('whatsapp.view'),
  asyncHandler(async (req, res) => {
    const before = typeof req.query.before === 'string' ? new Date(req.query.before) : undefined;
    res.json(
      await conversationThread(String(req.params.id), {
        limit: Number(req.query.limit) || 50,
        before: before && !Number.isNaN(before.getTime()) ? before : undefined,
      }),
    );
  }),
);

// ---- Outreach campaigns -----------------------------------------------------
// Separate permissions from the assistant, and separate from each other:
// `outreach.view` reads what was sent and to whom, `outreach.send` decides to
// message thousands of people unprompted. Reading the channel inbox
// (`whatsapp.view`) grants neither.

/**
 * Which rail outreach goes out on, and how fast.
 *
 * Read by the composer so it asks for a template name or the message text -
 * whichever the live rail actually sends - rather than both.
 */
router.get(
  '/campaigns/rail',
  requireAuth,
  requirePermission('outreach.view'),
  asyncHandler(async (_req, res) => {
    res.json(CampaignService.outreachRail());
  }),
);

/** The segments an operator can choose from, with a live count for each. */
router.get(
  '/campaigns/segments',
  requireAuth,
  requirePermission('outreach.view'),
  asyncHandler(async (_req, res) => {
    res.json(await CampaignService.segments());
  }),
);

/** Who a segment would reach right now, with a masked sample to sanity-check it. */
router.get(
  '/campaigns/preview',
  requireAuth,
  requirePermission('outreach.view'),
  asyncHandler(async (req, res) => {
    res.json(await CampaignService.preview(String(req.query.segment ?? '')));
  }),
);

router.get(
  '/campaigns',
  requireAuth,
  requirePermission('outreach.view'),
  asyncHandler(async (req, res) => {
    res.json(await CampaignService.list(Number(req.query.limit) || 30));
  }),
);

router.get(
  '/campaigns/:id',
  requireAuth,
  requirePermission('outreach.view'),
  asyncHandler(async (req, res) => {
    res.json(await CampaignService.detail(String(req.params.id)));
  }),
);

/** Compose and send. Audited, and the audience is frozen into recipient rows. */
router.post(
  '/campaigns',
  requireAuth,
  requirePermission('outreach.send'),
  asyncHandler(async (req, res) => {
    const input = sendCampaignSchema.parse(req.body);
    res.status(201).json(
      await CampaignService.send(req.user!.id, input, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }),
    );
  }),
);

/** Stop the remaining sends. Delivered messages cannot be recalled. */
router.post(
  '/campaigns/:id/cancel',
  requireAuth,
  requirePermission('outreach.send'),
  asyncHandler(async (req, res) => {
    res.json(
      await CampaignService.cancel(req.user!.id, String(req.params.id), {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }),
    );
  }),
);

/** Try the recipients that failed, again. Never re-sends to anyone already sent. */
router.post(
  '/campaigns/:id/retry',
  requireAuth,
  requirePermission('outreach.send'),
  asyncHandler(async (req, res) => {
    res.json(
      await CampaignService.retryFailed(req.user!.id, req.params.id, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }),
    );
  }),
);

/**
 * Where verification codes are going, and whether that route is actually up.
 *
 * Worth its own endpoint because the failure here is silent: a WasenderAPI
 * session drops when the linked phone goes offline or someone logs the device
 * out, and from that moment every code falls through to SMS without anything
 * visibly breaking. The only symptom is users saying they never got a code.
 *
 * Read-only and behind `whatsapp.view`. It makes an outbound call, so it is NOT
 * on /health - a container liveness probe should not flap because a third party
 * is slow.
 */
router.get(
  '/otp-route',
  requireAuth,
  requirePermission('whatsapp.view'),
  asyncHandler(async (_req, res) => {
    const { whatsappOtpRoute } = await import('../lib/verification-code');
    const route = whatsappOtpRoute();

    if (route !== 'wasender') {
      return res.json({
        route,
        healthy: route !== 'none',
        detail:
          route === 'meta'
            ? 'Codes go over the Meta Cloud API using the approved template.'
            : 'No WhatsApp route is configured, so every code is sent by SMS.',
      });
    }

    const { WasenderClient } = await import('../whatsapp/wasender-client');
    const status = await WasenderClient.sessionStatus();
    const detailByStatus: Record<string, string> = {
      connected: 'The linked WhatsApp account is online and carrying codes.',
      connecting: 'The linked account is reconnecting. Check again shortly.',
      need_scan: 'The session needs a QR scan in the WasenderAPI dashboard before codes can send.',
      need_passkey: 'The session is waiting for a passkey approval.',
      disconnected: 'The linked account is offline. Every code is falling back to SMS.',
      logged_out: 'The device was logged out of WhatsApp. Re-link it in the WasenderAPI dashboard.',
      expired: 'The session expired. Re-link it in the WasenderAPI dashboard.',
      unknown: 'WasenderAPI did not answer, so the session state is unknown.',
    };
    res.json({
      route,
      sessionStatus: status,
      healthy: status === 'connected',
      detail: detailByStatus[status] ?? detailByStatus.unknown,
    });
  }),
);

/** Pause or resume the assistant. Audited - this one stops real money moving. */
router.post(
  '/toggle',
  requireAuth,
  requirePermission('whatsapp.manage'),
  asyncHandler(async (req, res) => {
    const enabled = req.body?.enabled !== false;
    // updateGroup validates, persists, refreshes the settings cache AND writes
    // the audit entry, so the switch goes through exactly the same path as any
    // other settings change rather than a bespoke one.
    await SettingsAdminService.updateGroup(req.user!.id, 'general', {
      ...systemSettings().general,
      whatsappEnabled: enabled,
    });
    res.json(await WhatsAppAdminService.overview(14));
  }),
);

export default router;
