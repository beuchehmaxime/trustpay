import { Request, Response } from 'express';
import { AdminEventType } from '@prisma/client';

import { AppError, asyncHandler } from '../lib/errors';
import { AdminNotifyService } from './adminnotify.service';
import { broadcastSchema, updateTemplateSchema } from './adminnotify.validation';

const operatorId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

const VALID_TYPE = new Set<AdminEventType>([
  'KYC_SUBMITTED',
  'KYC_ESCALATED',
  'AML_ALERT',
  'SANCTIONS_MATCH',
  'ACCOUNT_FROZEN',
  'DISPUTE_FILED',
  'DISPUTE_ESCALATED',
  'PAYOUT_PENDING',
  'ESCROW_ADJUSTED',
  'OPERATOR_ADDED',
  'ROLE_CHANGED',
  'SETTINGS_CHANGED',
  'REPORT_READY',
  'BROADCAST_SENT',
  'SYSTEM',
]);

export const AdminNotifyController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const rawType = String(req.query.type ?? '').toUpperCase();
    const type = VALID_TYPE.has(rawType as AdminEventType) ? (rawType as AdminEventType) : undefined;
    const unreadOnly = req.query.unread === 'true';
    res.json(await AdminNotifyService.list(operatorId(req), { type, unreadOnly }));
  }),

  feed: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminNotifyService.feed(operatorId(req)));
  }),

  unreadCount: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminNotifyService.unreadCount(operatorId(req)));
  }),

  stats: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminNotifyService.stats(operatorId(req)));
  }),

  markRead: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminNotifyService.markRead(operatorId(req), req.params.id));
  }),

  markAllRead: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminNotifyService.markAllRead(operatorId(req)));
  }),

  broadcast: asyncHandler(async (req: Request, res: Response) => {
    const input = broadcastSchema.parse(req.body);
    res.json(await AdminNotifyService.broadcast(operatorId(req), input));
  }),

  broadcasts: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminNotifyService.recentBroadcasts(operatorId(req)));
  }),

  runWeeklyDigest: asyncHandler(async (_req: Request, res: Response) => {
    const { DigestService } = await import('../digest/digest.service');
    res.json(await DigestService.runWeeklyBroadcast());
  }),

  audiences: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await AdminNotifyService.audienceCounts());
  }),

  // ---- Templates ----
  templates: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await AdminNotifyService.listTemplates());
  }),

  updateTemplate: asyncHandler(async (req: Request, res: Response) => {
    const input = updateTemplateSchema.parse(req.body);
    res.json(await AdminNotifyService.updateTemplate(operatorId(req), req.params.key, input));
  }),

  testTemplate: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminNotifyService.sendTestTemplate(operatorId(req), req.params.key));
  }),

  // ---- Moderation ----
  moderationQueue: asyncHandler(async (req: Request, res: Response) => {
    const raw = String(req.query.status ?? '').toUpperCase();
    const status = raw === 'RESOLVED' || raw === 'ALL' ? (raw as 'RESOLVED' | 'ALL') : 'PENDING';
    res.json(await AdminNotifyService.moderationQueue(status));
  }),

  moderationCount: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await AdminNotifyService.moderationCount());
  }),

  moderationThread: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminNotifyService.moderationThread(req.params.id));
  }),

  removeMessage: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminNotifyService.removeReportedMessage(operatorId(req), req.params.id));
  }),

  dismissReport: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AdminNotifyService.dismissReport(operatorId(req), req.params.id));
  }),
};
