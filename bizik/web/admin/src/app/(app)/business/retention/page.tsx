'use client';

import { useProductAnalytics } from '@/features/analytics/business.hooks';
import { RequirePermission } from '@/features/analytics/guard';
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Empty,
  Failed,
  Loading,
  Note,
  Stat,
  StatRow,
  Table,
  Td,
  Th,
} from '@/features/analytics/ui';

/**
 * Retention: who comes back, and whether that is improving.
 *
 * Deliberately not a churn percentage. Churn is a subscription idea - it assumes
 * a customer is either paying this month or has left - and Bizik has no
 * subscription, so a single churn number would be invented rather than measured.
 * Cohorts answer the same question honestly: of the people who joined in a given
 * week, how many were still signing in one, two, three and four weeks later.
 *
 * Nothing on this page honours the reporting window, because every figure here
 * is defined by its own period: a 30 day active count does not become a 7 day
 * one because a picker was moved.
 */
export default function RetentionPage() {
  return (
    <RequirePermission permission="analytics.product" what="Retention">
      <RetentionContent />
    </RequirePermission>
  );
}

function RetentionContent() {
  const query = useProductAnalytics(30);

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <Failed what="retention" />;

  const { activity, cohorts } = query.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Who comes back"
          description="Active means a successful sign-in within the period, which is the only return signal the platform records for everyone."
        />
        <CardBody className="space-y-6">
          <StatRow columns={6}>
            <Stat label="Daily active" value={activity.dau} hint="Last 24 hours" />
            <Stat label="Weekly active" value={activity.wau} hint="Last 7 days" />
            <Stat label="Monthly active" value={activity.mau} hint="Last 30 days" />
            <Stat
              label="Stickiness"
              value={
                activity.stickiness === null ? null : `${(activity.stickiness * 100).toFixed(0)}%`
              }
              hint="Daily over monthly"
            />
            <Stat
              label="Returning"
              value={activity.returningUsers}
              hint="Signed in on 2+ days"
              tone="positive"
            />
            <Stat
              label="Never returned"
              value={activity.oneAndDone}
              hint="Signed in exactly once"
              tone={activity.oneAndDone > activity.returningUsers ? 'negative' : 'neutral'}
            />
          </StatRow>

          <Note>
            An escrow product is not a daily habit, so low stickiness is expected and is not the
            number to chase. The one that matters here is &quot;never returned&quot;: those people
            tried once and found nothing worth coming back for.
          </Note>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Retention by signup week"
          description="Cohorts rather than one churn figure, because a single number cannot show whether the product is getting better for people who join now. Read down a column to compare weeks; read across a row to follow one group."
        />
        <CardBody className="space-y-5">
          {cohorts.note ? <Callout>{cohorts.note}</Callout> : null}

          {cohorts.rows.length ? (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Week of</Th>
                    <Th align="right">Signed up</Th>
                    {['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((week) => (
                      <Th key={week} align="right">
                        {week}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.rows.map((row) => (
                    <tr key={row.cohort}>
                      <Td className="font-medium tabular-nums">{row.cohort}</Td>
                      <Td align="right" className="font-semibold">
                        {row.size}
                      </Td>
                      {row.retention.map((value, index) => (
                        <RetentionCell key={index} value={value} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Note>
                A blank cell is a week that has not finished yet, not a zero. It fills in on its own
                once enough time has passed for the answer to exist.
              </Note>
            </>
          ) : (
            <Empty>No signup weeks completed yet.</Empty>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * One cohort cell, shaded by how many came back.
 *
 * The shade carries the comparison and the number carries the fact. A table of
 * bare percentages is readable one cell at a time; shading is what makes a
 * column of them comparable at a glance, which is the only reason to lay
 * cohorts out as a grid at all.
 */
function RetentionCell({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <Td align="right">
        <span className="text-subtle">-</span>
      </Td>
    );
  }

  return (
    <Td align="right" className="p-1.5">
      <span
        className="inline-block min-w-[48px] rounded-md px-2 py-1.5 text-[12.5px] font-semibold tabular-nums"
        style={{
          // Floor of 0.06 so a measured 0% still reads as a filled cell rather
          // than blending into an unmeasured one.
          backgroundColor: `color-mix(in srgb, var(--color-brand-500) ${Math.max(6, value * 100) * 0.85}%, transparent)`,
          color: value > 0.5 ? '#ffffff' : 'var(--color-ink)',
        }}
      >
        {(value * 100).toFixed(0)}%
      </span>
    </Td>
  );
}
