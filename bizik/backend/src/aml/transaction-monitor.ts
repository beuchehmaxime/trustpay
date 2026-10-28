import { AmlAlertType, WalletTxType } from '@prisma/client';

import { emitAdminEvent } from '../lib/admin-events';
import { toUsd } from '../lib/domain';
import { usdRateOf } from '../lib/settings';
import { prisma } from '../lib/prisma';
import { amlMonitoringSettings } from '../lib/system-settings';
import { AmlRepository } from './aml.repository';

/**
 * Ongoing transaction monitoring.
 *
 * Until this existed, `AmlRepository.createAlert` had exactly ONE caller: the
 * sanctions screen run once at onboarding. Nothing watched what an account did
 * afterwards, so the three alert types the schema already defined -
 * STRUCTURING, VELOCITY_ANOMALY, HIGH_RISK_FLOW - could never be raised. A
 * programme that checks a customer at signup and never looks again does not
 * meet CEMAC Regulation 01/CEMAC/UMAC/CM of 11 April 2016, which requires
 * monitoring of the business relationship and of transactions throughout.
 *
 * Design decisions worth knowing:
 *
 * It runs as a SWEEP over committed wallet movements, not as a hook inside the
 * payment path. Two reasons. `creditWallet` and `debitWallet` execute inside a
 * database transaction, so work added there holds locks and can fail a
 * payment - monitoring must never be able to cost a customer their money. And
 * a sweep cannot be bypassed: a new money path added later is watched the day
 * it ships, without anyone remembering to call anything.
 *
 * It alerts, and never acts by itself. Every rule here opens a case for a human
 * in the compliance queue. Freezing an account on a rule alone would strand
 * innocent people's money on a pattern match, and the regulation expects a
 * person to decide.
 *
 * Thresholds are settings, not constants. Compliance tunes them as the real
 * distribution of traffic becomes known; a threshold that needs a deploy to
 * change is a threshold that stays wrong.
 */

/**
 * One wallet movement, normalised to XAF so multi-currency wallets compare on
 * the scale the obligations are written in. A USD yardstick would drift against
 * the CEMAC figure every time the rate moved, which is the wrong thing to let
 * float underneath a regulatory threshold.
 */
interface Movement {
  id: string;
  userId: string;
  type: WalletTxType;
  xaf: number;
  createdAt: Date;
  reference: string | null;
}

/** Money coming IN to an account. */
const INBOUND: WalletTxType[] = ['DEPOSIT', 'TRANSFER_IN', 'REFUND', 'FX_IN'];
/** Money going OUT, which is where laundering ends and where loss is real. */
const OUTBOUND: WalletTxType[] = ['WITHDRAWAL', 'TRANSFER_OUT', 'ESCROW_HOLD', 'FX_OUT'];

/**
 * How long the same rule stays quiet for one user after firing.
 *
 * Without this, a busy account trips the same rule on every sweep and buries
 * the queue - and a compliance queue nobody can read is worse than no queue,
 * because it looks like coverage.
 */
const ALERT_COOLDOWN_HOURS = 24;

/** Format XAF the way a Cameroonian reviewer reads it. */
function xaf(amount: number): string {
  return `FCFA ${Math.round(amount).toLocaleString('en-US')}`;
}

export interface MonitorResult {
  scanned: number;
  raised: { type: AmlAlertType; userId: string }[];
}

/**
 * Examine recent movements and open cases for anything that looks wrong.
 *
 * Returns what it did so the scheduler can log it and an operator can see the
 * monitoring is alive - silence from a detection system should never be
 * ambiguous between "nothing happened" and "nothing ran".
 */
export async function runTransactionMonitor(): Promise<MonitorResult> {
  const settings = amlMonitoringSettings();
  if (!settings.enabled) return { scanned: 0, raised: [] };

  const windowHours = Math.max(
    settings.velocityWindowHours,
    settings.structuringWindowHours,
    settings.passThroughWindowHours,
  );
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const movements = await loadMovements(since);
  if (!movements.length) return { scanned: 0, raised: [] };

  const byUser = new Map<string, Movement[]>();
  for (const movement of movements) {
    const list = byUser.get(movement.userId) ?? [];
    list.push(movement);
    byUser.set(movement.userId, list);
  }

  const raised: { type: AmlAlertType; userId: string }[] = [];
  for (const [userId, userMovements] of byUser) {
    for (const finding of evaluateUser(userMovements, settings)) {
      const opened = await openCase(userId, finding);
      if (opened) raised.push({ type: finding.type, userId });
    }
  }

  return { scanned: movements.length, raised };
}

/**
 * The rules themselves, kept pure so they can be reasoned about and tested
 * without a database.
 */
export interface Finding {
  type: AmlAlertType;
  reason: string;
  details: Record<string, unknown>;
}

export function evaluateUser(
  movements: Movement[],
  settings: ReturnType<typeof amlMonitoringSettings>,
): Finding[] {
  const findings: Finding[] = [];
  const now = Date.now();
  const within = (hours: number) =>
    movements.filter((movement) => now - movement.createdAt.getTime() <= hours * 60 * 60 * 1000);

  // ---- Rule 1: a single movement large enough to report on its own ----
  const large = movements.filter((movement) => movement.xaf >= settings.reviewThresholdXaf);
  if (large.length) {
    const biggest = large.reduce((a, b) => (a.xaf > b.xaf ? a : b));
    findings.push({
      type: 'HIGH_RISK_FLOW',
      reason: `A single ${biggest.type.toLowerCase()} of about ${xaf(biggest.xaf)} is at or above the ${xaf(settings.reviewThresholdXaf)} review line.`,
      details: { rule: 'large_transaction', reference: biggest.reference, xaf: Math.round(biggest.xaf), type: biggest.type },
    });
  }

  // ---- Rule 2: structuring ----
  // Several inbound amounts each deliberately UNDER the threshold, together
  // well over it. This is the classic way a reporting threshold is evaded, and
  // it is invisible to any rule that only looks at one transaction at a time.
  const structuringWindow = within(settings.structuringWindowHours).filter(
    (movement) =>
      INBOUND.includes(movement.type) &&
      movement.xaf < settings.reportingThresholdXaf &&
      movement.xaf >= settings.reportingThresholdXaf * settings.structuringNearThresholdRatio,
  );
  const structuringTotal = structuringWindow.reduce((sum, movement) => sum + movement.xaf, 0);
  if (
    structuringWindow.length >= settings.structuringMinCount &&
    structuringTotal >= settings.reportingThresholdXaf
  ) {
    findings.push({
      type: 'STRUCTURING',
      reason: `${structuringWindow.length} deposits, each below the ${xaf(settings.reportingThresholdXaf)} reporting threshold but totalling about ${xaf(structuringTotal)}, within ${settings.structuringWindowHours} hours.`,
      details: {
        rule: 'structuring',
        count: structuringWindow.length,
        totalXaf: Math.round(structuringTotal),
        windowHours: settings.structuringWindowHours,
        references: structuringWindow.map((movement) => movement.reference),
      },
    });
  }

  // ---- Rule 3: velocity ----
  const velocityWindow = within(settings.velocityWindowHours);
  const velocityTotal = velocityWindow.reduce((sum, movement) => sum + movement.xaf, 0);
  if (
    velocityWindow.length >= settings.velocityMaxCount ||
    velocityTotal >= settings.velocityMaxXaf
  ) {
    findings.push({
      type: 'VELOCITY_ANOMALY',
      reason: `${velocityWindow.length} movements totalling about ${xaf(velocityTotal)} in ${settings.velocityWindowHours} hours, against limits of ${settings.velocityMaxCount} movements or ${xaf(settings.velocityMaxXaf)}.`,
      details: {
        rule: 'velocity',
        count: velocityWindow.length,
        totalXaf: Math.round(velocityTotal),
        windowHours: settings.velocityWindowHours,
      },
    });
  }

  // ---- Rule 4: pass-through ----
  // Money arriving and leaving again almost untouched. A wallet being used as a
  // corridor rather than as an account is the shape most laundering takes, and
  // it is legitimate often enough that it must be reviewed rather than blocked.
  const passWindow = within(settings.passThroughWindowHours);
  const arrived = passWindow
    .filter((movement) => INBOUND.includes(movement.type))
    .reduce((sum, movement) => sum + movement.xaf, 0);
  const left = passWindow
    .filter((movement) => OUTBOUND.includes(movement.type))
    .reduce((sum, movement) => sum + movement.xaf, 0);
  if (
    arrived >= settings.passThroughMinXaf &&
    left >= arrived * settings.passThroughRatio
  ) {
    findings.push({
      type: 'HIGH_RISK_FLOW',
      reason: `About ${xaf(arrived)} arrived and ${xaf(left)} left within ${settings.passThroughWindowHours} hours - the account is being used as a corridor rather than held in.`,
      details: {
        rule: 'pass_through',
        arrivedXaf: Math.round(arrived),
        leftXaf: Math.round(left),
        windowHours: settings.passThroughWindowHours,
      },
    });
  }

  return findings;
}

/**
 * Convert any supported currency to its XAF equivalent, via USD.
 *
 * Multi-currency wallets have to compare on one scale, and that scale is the
 * one the obligations are written in.
 */
function toXaf(amount: number, currency: Parameters<typeof toUsd>[1]): number {
  if (currency === 'XAF') return amount;
  return toUsd(amount, currency) / usdRateOf('XAF');
}

/** Recent wallet movements, joined to their owner and normalised to XAF. */
async function loadMovements(since: Date): Promise<Movement[]> {
  const rows = await prisma.walletTransaction.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      type: true,
      amount: true,
      currency: true,
      reference: true,
      createdAt: true,
      wallet: { select: { userId: true } },
    },
    orderBy: { createdAt: 'asc' },
    // A ceiling so a traffic spike cannot turn one sweep into an unbounded
    // query. If this is ever hit the window should shrink, not the limit grow.
    take: 20_000,
  });

  return rows
    .filter((row) => row.wallet?.userId)
    .map((row) => ({
      id: row.id,
      userId: row.wallet.userId,
      type: row.type,
      // Amounts are signed in the ledger; direction is carried by `type`.
      xaf: toXaf(Math.abs(Number(row.amount)), row.currency),
      createdAt: row.createdAt,
      reference: row.reference,
    }));
}

/**
 * Open a compliance case, unless the same rule already fired for this user
 * recently. Returns whether a case was actually opened.
 */
async function openCase(userId: string, finding: Finding): Promise<boolean> {
  const cooldownSince = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000);
  const existing = await prisma.amlAlert.findFirst({
    where: {
      userId,
      type: finding.type,
      createdAt: { gte: cooldownSince },
      // A case someone is still working is not re-opened; a cleared one may be,
      // because the behaviour recurring after a clearance is itself a signal.
      status: { in: ['NEW', 'UNDER_REVIEW'] },
    },
    select: { id: true },
  });
  if (existing) return false;

  const alert = await AmlRepository.createAlert({
    userId,
    type: finding.type,
    status: 'NEW',
    details: { ...finding.details, reason: finding.reason, source: 'transaction_monitor' },
  });

  void emitAdminEvent({
    type: 'AML_ALERT',
    severity: 'WARNING',
    title: `Transaction monitoring: ${finding.type.replace(/_/g, ' ').toLowerCase()}`,
    body: finding.reason,
    entityType: 'AmlAlert',
    entityId: alert.id,
    permission: 'aml.view',
  });

  return true;
}

/**
 * Does this account have an unresolved compliance case?
 *
 * Asked on the OUTBOUND path, before money leaves. An alert raised after a
 * withdrawal has settled documents a loss; holding the payout until a person
 * has looked prevents one, and that difference is what separates a monitoring
 * programme from a reporting one.
 *
 * It holds the TRANSACTION, never the account. The customer keeps their balance
 * and their access; clearing the case releases the payout. Freezing people on a
 * pattern match is how innocent users lose access to their own money.
 */
export async function hasOpenComplianceCase(userId: string): Promise<boolean> {
  if (!amlMonitoringSettings().holdOutboundOnOpenCase) return false;
  const open = await prisma.amlAlert.findFirst({
    where: { userId, status: { in: ['NEW', 'UNDER_REVIEW', 'ESCALATED'] } },
    select: { id: true },
  });
  return !!open;
}

/**
 * Screen one account's recent history right now, synchronously.
 *
 * The periodic sweep is near-real-time, which is right for behavioural patterns
 * but leaves a window: a structuring run completed two minutes ago has not been
 * swept yet, and a withdrawal in that window would settle before anything
 * noticed. Running the same rules inline at cash-out closes it. One indexed
 * query over a bounded window, so it costs a few milliseconds on the one path
 * where being late actually matters.
 *
 * Returns the findings rather than acting on them, so the caller decides
 * whether this is a hold or merely a note.
 */
export async function screenUserNow(userId: string): Promise<Finding[]> {
  const settings = amlMonitoringSettings();
  if (!settings.enabled) return [];

  const windowHours = Math.max(
    settings.velocityWindowHours,
    settings.structuringWindowHours,
    settings.passThroughWindowHours,
  );
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const rows = await prisma.walletTransaction.findMany({
    where: { createdAt: { gte: since }, wallet: { userId } },
    select: {
      id: true,
      type: true,
      amount: true,
      currency: true,
      reference: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  });

  const movements: Movement[] = rows.map((row) => ({
    id: row.id,
    userId,
    type: row.type,
    xaf: toXaf(Math.abs(Number(row.amount)), row.currency),
    createdAt: row.createdAt,
    reference: row.reference,
  }));

  const findings = evaluateUser(movements, settings);
  // Opening the case here too means the reviewer sees why the payout was held,
  // rather than finding a held payment with no explanation attached to it.
  for (const finding of findings) {
    await openCase(userId, finding);
  }
  return findings;
}
