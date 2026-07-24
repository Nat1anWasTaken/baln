import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { PeriodSummary } from "@/lib/schemas";

const chartConfig = {
  amount: {
    label: "金額",
    color: "var(--color-chart-2)",
  },
} satisfies ChartConfig;

export function SummaryCards({ summary }: { summary: PeriodSummary }) {
  const cards = [
    {
      label: "收入",
      amount: summary.income_minor,
      icon: ArrowUpRight,
    },
    {
      label: "支出",
      amount: summary.expense_minor,
      icon: ArrowDownRight,
    },
    {
      label: "淨額",
      amount: summary.net_minor,
      icon: Scale,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((item) => (
        <Card key={item.label}>
          <CardHeader className="flex-row items-center justify-between pb-1">
            <CardDescription>{item.label}</CardDescription>
            <item.icon
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(item.amount)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CategoryChart({
  title,
  description,
  accounts,
}: {
  title: string;
  description: string;
  accounts: PeriodSummary["expense_accounts"];
}) {
  const data = accounts.map((account) => ({
    name: account.account_name,
    amount: account.total_minor,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            這個期間沒有可顯示的資料。
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="min-h-64 w-full"
              aria-label={`${title}長條圖`}
            >
              <BarChart
                accessibilityLayer
                data={data}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={72}
                />
                <XAxis dataKey="amount" type="number" hide />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatMoney(Number(value))}
                    />
                  }
                />
                <Bar dataKey="amount" fill="var(--color-amount)" radius={4} />
              </BarChart>
            </ChartContainer>
            <ul className="sr-only">
              {data.map((item) => (
                <li key={item.name}>
                  {item.name}：{formatMoney(item.amount)}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
