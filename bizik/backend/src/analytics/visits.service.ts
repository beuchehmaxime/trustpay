import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

/**
 * Visit analytics, from first-party events.
 *
 * Built rather than bought. A third-party script would have been faster, but it
 * would mean every visitor to a financial product is reported to an advertising
 * network, and the processor register would gain an entry that is hard to
 * justify to anyone. These events never leave the platform.
 *
 * The events are deliberately thin: an anonymous browser-generated id, a path,
 * a referrer, and how long the page was open. No IP, no device fingerprint, no
 * cross-site identifier. That is enough to answer how many people came, what
 * they looked at, and where they stopped - which is the whole question - and
 * not enough to be a privacy liability.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface VisitTotals {
  /** Distinct visitors, not page views. */
  today: number;
  last7Days: number;
  last30Days: number;
  allTime: number;
  pageViewsLast30Days: number;
  /** Visitors who came back on a later day. */
  returningVisitors: number;
}

export async function visitTotals(): Promise<VisitTotals> {
  const now = Date.now();
  const [row] = await prisma.$queryRaw<
    {
      today: bigint;
      week: bigint;
      month: bigint;
      allTime: bigint;
      views: bigint;
      returning: bigint;
    }[]
  >`
    SELECT
      COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" >= ${new Date(now - DAY_MS)})::bigint AS "today",
      COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" >= ${new Date(now - 7 * DAY_MS)})::bigint AS "week",
      COUNT(DISTINCT "visitorId") FILTER (WHERE "createdAt" >= ${new Date(now - 30 * DAY_MS)})::bigint AS "month",
      COUNT(DISTINCT "visitorId")::bigint AS "allTime",
      COUNT(*) FILTER (WHERE "name" = 'page_view' AND "createdAt" >= ${new Date(now - 30 * DAY_MS)})::bigint AS "views",
      (SELECT COUNT(*)::bigint FROM (
        SELECT "visitorId" FROM analytics_events
        GROUP BY "visitorId" HAVING COUNT(DISTINCT DATE("createdAt")) > 1
      ) repeat_visitors) AS "returning"
    FROM analytics_events
  `;

  return {
    today: Number(row.today),
    last7Days: Number(row.week),
    last30Days: Number(row.month),
    allTime: Number(row.allTime),
    pageViewsLast30Days: Number(row.views),
    returningVisitors: Number(row.returning),
  };
}

export interface PageStat {
  path: string;
  views: number;
  visitors: number;
  /** Median seconds on the page. Median, not mean - one tab left open all */
  medianSeconds: number | null;
  /** Share of visitors whose LAST event was on this page. */
  exitRate: number | null;
}

/**
 * Where people spend their time, and where they leave.
 *
 * Time is reported as a MEDIAN. One person leaving a tab open overnight drags a
 * mean into nonsense, and the figure is used to decide where to put effort, so
 * it has to describe the typical visit rather than the strangest one.
 */
export async function pageStats(days = 30, limit = 20): Promise<PageStat[]> {
  const since = new Date(Date.now() - days * DAY_MS);

  const rows = await prisma.$queryRaw<
    { path: string; views: bigint; visitors: bigint; medianMs: number | null; exits: bigint }[]
  >`
    WITH scoped AS (
      SELECT * FROM analytics_events
      WHERE "createdAt" >= ${since} AND "name" = 'page_view' AND "path" IS NOT NULL
    ),
    last_event AS (
      SELECT DISTINCT ON ("visitorId") "visitorId", "path"
      FROM scoped ORDER BY "visitorId", "createdAt" DESC
    )
    SELECT
      s."path" AS "path",
      COUNT(*)::bigint AS "views",
      COUNT(DISTINCT s."visitorId")::bigint AS "visitors",
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY s."durationMs") AS "medianMs",
      (SELECT COUNT(*)::bigint FROM last_event l WHERE l."path" = s."path") AS "exits"
    FROM scoped s
    GROUP BY s."path"
    ORDER BY COUNT(*) DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => {
    const visitors = Number(row.visitors);
    return {
      path: row.path,
      views: Number(row.views),
      visitors,
      medianSeconds: row.medianMs === null ? null : Math.round(row.medianMs / 1000),
      exitRate: visitors === 0 ? null : Number(row.exits) / visitors,
    };
  });
}

export interface TrafficSource {
  source: string;
  visitors: number;
}

/** Where visitors came from, grouped to a domain so the list stays readable. */
export async function trafficSources(days = 30): Promise<TrafficSource[]> {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await prisma.$queryRaw<{ source: string; visitors: bigint }[]>`
    SELECT
      COALESCE(NULLIF(SPLIT_PART(SPLIT_PART(REPLACE(REPLACE("referrer", 'https://', ''), 'http://', ''), '/', 1), '?', 1), ''), 'direct') AS "source",
      COUNT(DISTINCT "visitorId")::bigint AS "visitors"
    FROM analytics_events
    WHERE "createdAt" >= ${since}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 15
  `;
  return rows.map((row) => ({ source: row.source, visitors: Number(row.visitors) }));
}

export interface DailyVisits {
  date: string;
  visitors: number;
  pageViews: number;
}

/** Daily visitors for a trend line. */
export async function dailyVisits(days = 30): Promise<DailyVisits[]> {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await prisma.$queryRaw<{ day: Date; visitors: bigint; views: bigint }[]>`
    SELECT
      DATE("createdAt") AS "day",
      COUNT(DISTINCT "visitorId")::bigint AS "visitors",
      COUNT(*) FILTER (WHERE "name" = 'page_view')::bigint AS "views"
    FROM analytics_events
    WHERE "createdAt" >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  return rows.map((row) => ({
    date: row.day.toISOString().slice(0, 10),
    visitors: Number(row.visitors),
    pageViews: Number(row.views),
  }));
}

/**
 * How many anonymous visitors went on to create an account.
 *
 * The one number that joins the two halves of the funnel: everything before an
 * account exists is measured in visitors, everything after it in users, and
 * this is the bridge.
 */
export async function visitorToSignupRate(days = 30): Promise<{
  visitors: number;
  signedUp: number;
  rate: number | null;
}> {
  const since = new Date(Date.now() - days * DAY_MS);
  const [row] = await prisma.$queryRaw<{ visitors: bigint; signedUp: bigint }[]>`
    SELECT
      COUNT(DISTINCT "visitorId")::bigint AS "visitors",
      COUNT(DISTINCT "visitorId") FILTER (WHERE "userId" IS NOT NULL)::bigint AS "signedUp"
    FROM analytics_events
    WHERE "createdAt" >= ${since}
  `;
  const visitors = Number(row.visitors);
  const signedUp = Number(row.signedUp);
  return { visitors, signedUp, rate: visitors === 0 ? null : signedUp / visitors };
}

/** One batch of events from a browser. Validated by the route before it gets here. */
export interface IncomingEvent {
  visitorId: string;
  userId?: string | null;
  name: string;
  path?: string | null;
  referrer?: string | null;
  durationMs?: number | null;
}

/**
 * Record events. Never throws into the request path.
 *
 * Analytics is the least important thing this server does, and must behave like
 * it: a failure here returns success to the browser and loses the event. The
 * alternative - an error that a visitor notices because a tracking row would not
 * insert - gets the priorities exactly backwards.
 */
export async function recordEvents(events: IncomingEvent[]): Promise<number> {
  if (!events.length) return 0;
  try {
    const { count } = await prisma.analyticsEvent.createMany({
      data: events.map((event) => ({
        visitorId: event.visitorId,
        userId: event.userId ?? null,
        name: event.name,
        path: event.path ?? null,
        referrer: event.referrer ?? null,
        durationMs:
          typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)
            ? // Capped at four hours. A tab left open for a week is not a
              // four-day page view, and one such row would distort every median
              // it appears in.
              Math.max(0, Math.min(Math.round(event.durationMs), 4 * 60 * 60 * 1000))
            : null,
      })),
    });
    return count;
  } catch (error) {
    console.warn('[analytics] dropped a batch of events:', (error as Error).message);
    return 0;
  }
}

export { Prisma };
