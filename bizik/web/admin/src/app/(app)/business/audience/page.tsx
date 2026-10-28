'use client';

import { useProductAnalytics } from '@/features/analytics/business.hooks';
import { AreaChart, RankedBars } from '@/features/analytics/charts';
import { RequirePermission } from '@/features/analytics/guard';
import { useRange } from '@/features/analytics/range';
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
 * Audience: who arrives, from where, and what they do before leaving.
 *
 * The only page built on the first-party tracker rather than on account rows,
 * so it is also the only one that cannot show history: it knows nothing from
 * before tracking shipped, and says so rather than implying the site had no
 * traffic.
 */
export default function AudiencePage() {
  return (
    <RequirePermission permission="analytics.product" what="Audience">
      <AudienceContent />
    </RequirePermission>
  );
}

function AudienceContent() {
  const { days } = useRange();
  const query = useProductAnalytics(days);

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <Failed what="audience analytics" />;

  const { visits, pages, sources, daily, conversion } = query.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Visitors"
          description="Distinct people, not page views. Counted first-party: nothing is sent to an advertising network, and visitors with Do Not Track set are not counted at all."
        />
        <CardBody className="space-y-6">
          <StatRow columns={6}>
            <Stat label="Today" value={visits.today} />
            <Stat label="7 days" value={visits.last7Days} />
            <Stat label="30 days" value={visits.last30Days} />
            <Stat label="All time" value={visits.allTime} />
            <Stat label="Page views, 30d" value={visits.pageViewsLast30Days} />
            <Stat label="Came back" value={visits.returningVisitors} hint="On a later day" />
          </StatRow>

          {visits.allTime === 0 ? (
            <Callout>
              No visits recorded yet. Tracking went live with this release, so this fills from here
              onward - it cannot show history from before it existed.
            </Callout>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Visitors per day" description={`Last ${days} days.`} />
        <CardBody>
          <AreaChart
            points={daily.map((day) => ({ label: day.date.slice(5), value: day.visitors }))}
          />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader
            title="Where time goes, and where visits end"
            description="Time is the median, not the average: one tab left open overnight would make an average meaningless. A high exit rate on a page people are meant to pass through is a problem; on the last page of a flow it is the goal."
          />
          <CardBody className="p-0">
            {pages.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Page</Th>
                    <Th align="right">Views</Th>
                    <Th align="right">Visitors</Th>
                    <Th align="right">Median time</Th>
                    <Th align="right">Left from here</Th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.path}>
                      <Td className="font-medium">{page.path}</Td>
                      <Td align="right">{page.views.toLocaleString('en-US')}</Td>
                      <Td align="right">{page.visitors.toLocaleString('en-US')}</Td>
                      <Td align="right">
                        {page.medianSeconds === null ? (
                          <span className="text-subtle">-</span>
                        ) : (
                          `${page.medianSeconds}s`
                        )}
                      </Td>
                      <Td align="right">
                        {page.exitRate === null ? (
                          <span className="text-subtle">-</span>
                        ) : (
                          <span
                            className={
                              page.exitRate > 0.7 ? 'font-semibold text-negative' : undefined
                            }
                          >
                            {(page.exitRate * 100).toFixed(0)}%
                          </span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>No page data in this window yet.</Empty>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Where they came from" description={`Last ${days} days.`} />
          <CardBody className="space-y-5">
            {sources.length ? (
              <RankedBars
                rows={sources.map((source) => ({
                  label: source.source,
                  value: source.visitors,
                }))}
              />
            ) : (
              <Empty>No referrers recorded yet.</Empty>
            )}

            <div className="border-t border-hairline pt-5">
              <Stat
                label="Visitor to account"
                value={
                  conversion.rate === null ? null : `${(conversion.rate * 100).toFixed(1)}%`
                }
                hint={`${conversion.signedUp.toLocaleString('en-US')} of ${conversion.visitors.toLocaleString('en-US')} visitors`}
              />
              <Note>
                <span className="mt-3 block">
                  Both sides are measured over the same window, so this is a rate rather than a
                  ratio of two unrelated totals.
                </span>
              </Note>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
