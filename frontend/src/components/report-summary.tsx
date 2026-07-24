import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

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

type CategoryTone = "income" | "expense";

const chartConfigs = {
  income: {
    amount: {
      label: "收入金額",
      color: "var(--color-finance-income)",
    },
  },
  expense: {
    amount: {
      label: "支出金額",
      color: "var(--color-finance-expense)",
    },
  },
} satisfies Record<CategoryTone, ChartConfig>;

const CATEGORY_ROW_HEIGHT = 40;
const MIN_CATEGORY_CHART_HEIGHT = 80;

export function SummaryCards({ summary }: { summary: PeriodSummary }) {
  const cards = [
    {
      label: "收入",
      amount: summary.income_minor,
      icon: ArrowUpRight,
      tone: "income",
      amountClassName: "text-finance-income",
      iconClassName: "bg-finance-income/10 text-finance-income",
    },
    {
      label: "支出",
      amount: summary.expense_minor,
      icon: ArrowDownRight,
      tone: "expense",
      amountClassName: "text-finance-expense",
      iconClassName: "bg-finance-expense/10 text-finance-expense",
    },
    {
      label: "淨額",
      amount: summary.net_minor,
      icon: Scale,
      tone: "net",
      amountClassName: "text-finance-net",
      iconClassName: "bg-finance-net/10 text-finance-net",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((item) => (
        <Card key={item.tone} data-finance-tone={item.tone}>
          <CardHeader className="flex-row items-center justify-between pb-1">
            <CardDescription>{item.label}</CardDescription>
            <span className={`rounded-md p-1.5 ${item.iconClassName}`}>
              <item.icon className="size-4" aria-hidden="true" />
            </span>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-semibold tabular-nums ${item.amountClassName}`}
            >
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
  tone,
}: {
  title: string;
  description: string;
  accounts: PeriodSummary["expense_accounts"];
  tone: CategoryTone;
}) {
  const data = accounts.map((account) => ({
    name: account.account_name,
    amount: account.total_minor,
  }));
  const chartConfig = chartConfigs[tone];

  return (
    <Card data-finance-tone={tone}>
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
              className="aspect-auto w-full"
              style={{
                height: Math.max(
                  MIN_CATEGORY_CHART_HEIGHT,
                  data.length * CATEGORY_ROW_HEIGHT,
                ),
              }}
              aria-label={`${title}長條圖`}
            >
              <BarChart
                accessibilityLayer
                data={data}
                layout="vertical"
                margin={{ left: 8, right: 104 }}
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
                <Bar
                  dataKey="amount"
                  fill="var(--color-amount)"
                  radius={4}
                  barSize={20}
                >
                  <LabelList
                    dataKey="amount"
                    position="right"
                    formatter={(value) => formatMoney(Number(value ?? 0))}
                    className="fill-foreground font-medium tabular-nums"
                  />
                </Bar>
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
