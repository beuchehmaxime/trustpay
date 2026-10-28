'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { useFinancialAnalytics } from '@/features/analytics/business.hooks';
import { PairedBarChart } from '@/features/analytics/charts';
import { RequirePermission } from '@/features/analytics/guard';
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Failed,
  Loading,
  Stat,
  StatRow,
  Table,
  Td,
  Th,
  xaf,
} from '@/features/analytics/ui';

const CATEGORY_LABEL: Record<string, string> = {
  INFRASTRUCTURE: 'Infrastructure',
  SALARIES: 'Salaries and contractors',
  PAYMENT_PROVIDER: 'Payment provider fees',
  MARKETING: 'Marketing',
  LEGAL_COMPLIANCE: 'Legal and compliance',
  OTHER: 'Other',
};

/**
 * Revenue and profit.
 *
 * Reported in XAF, not converted. Fees are charged in XAF, costs are paid in
 * XAF, and running the P&L through a daily exchange rate would make last month's
 * profit change depending on when it was looked at.
 */
export default function RevenuePage() {
  return (
    <RequirePermission permission="analytics.financial" what="Revenue and profit">
      <RevenueContent />
    </RequirePermission>
  );
}

function RevenueContent() {
  const query = useFinancialAnalytics();

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <Failed what="financial analytics" />;

  const { revenue, profitability, trend } = query.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Revenue"
          description="Fee income the platform kept, and the volume it was charged on."
        />
        {/* Three to a row, not five. A GMV in the hundreds of millions is
            sixteen characters wide and simply does not fit in a fifth of the
            content area, which is how the first version of this page ended up
            displaying a truncated amount of money. */}
        <CardBody className="space-y-7">
          <StatRow columns={3}>
            <Stat label="Last 30 days" value={xaf(revenue.last30dXaf)} size="lg" />
            <Stat
              label="vs previous 30"
              value={revenue.growthRate === null ? null : `${(revenue.growthRate * 100).toFixed(0)}%`}
              tone={
                revenue.growthRate === null
                  ? 'neutral'
                  : revenue.growthRate >= 0
                    ? 'positive'
                    : 'negative'
              }
              hint={`${xaf(revenue.previous30dXaf)} before`}
              size="lg"
            />
            <Stat
              label="Annualised run rate"
              value={xaf(revenue.annualisedRunRateXaf)}
              hint="Last 30 days x 12"
              size="lg"
            />
          </StatRow>

          <div className="border-t border-hairline pt-7">
            <StatRow columns={3}>
              <Stat
                label="GMV, 30 days"
                value={xaf(revenue.gmv30dXaf)}
                hint="Volume moved through escrow"
                size="lg"
              />
              <Stat
                label="Take rate"
                value={revenue.takeRate === null ? null : `${(revenue.takeRate * 100).toFixed(2)}%`}
                hint="Fees over GMV"
                size="lg"
              />
              <Stat
                label="Fees, all time"
                value={xaf(revenue.allTimeXaf)}
                hint="Since launch"
                size="lg"
              />
            </StatRow>
          </div>

          <Callout>{revenue.note}</Callout>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Profit and loss - ${profitability.month}`}
          description="Revenue the platform earned this month, less what the month cost to run."
          action={
            <Link
              href="/business/costs"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:opacity-80"
            >
              Edit costs <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <CardBody className="space-y-6">
          <StatRow columns={4}>
            <Stat label="Revenue" value={xaf(profitability.revenueXaf)} size="lg" />
            <Stat label="Operating costs" value={xaf(profitability.costsXaf)} size="lg" />
            <Stat
              label="EBITDA"
              value={profitability.ebitdaXaf === null ? null : xaf(profitability.ebitdaXaf)}
              tone={
                profitability.ebitdaXaf === null
                  ? 'neutral'
                  : profitability.ebitdaXaf >= 0
                    ? 'positive'
                    : 'negative'
              }
              size="lg"
            />
            <Stat
              label="Margin"
              value={
                profitability.marginPct === null
                  ? null
                  : `${(profitability.marginPct * 100).toFixed(0)}%`
              }
              tone={
                profitability.marginPct === null
                  ? 'neutral'
                  : profitability.marginPct >= 0
                    ? 'positive'
                    : 'negative'
              }
              size="lg"
            />
          </StatRow>

          {profitability.gap ? (
            <Callout tone="warning">
              <strong>{profitability.gap.metric} cannot be calculated.</strong>{' '}
              {profitability.gap.reason} {profitability.gap.needs}
            </Callout>
          ) : null}

          {profitability.costsByCategory.length ? (
            <div>
              <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                What the month cost
              </h3>
              <div className="mt-2">
                <Table>
                  <thead>
                    <tr>
                      <Th>Category</Th>
                      <Th align="right">Amount</Th>
                      <Th align="right">Share</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitability.costsByCategory.map((line) => (
                      <tr key={line.category}>
                        <Td>{CATEGORY_LABEL[line.category] ?? line.category}</Td>
                        <Td align="right">{xaf(line.amountXaf)}</Td>
                        <Td align="right" className="text-muted-foreground">
                          {profitability.costsXaf > 0
                            ? `${((line.amountXaf / profitability.costsXaf) * 100).toFixed(0)}%`
                            : '-'}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Twelve months"
          description="Revenue against operating costs, month by month. The gap between the two bars is the month's EBITDA."
        />
        <CardBody>
          <PairedBarChart
            periods={trend.map((month) => ({
              label: month.month,
              primary: month.revenueXaf,
              secondary: month.costsXaf,
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
