import { CircleAlert } from "lucide-react";

import { TransactionDisplay } from "@/components/transaction-display";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { transactionViewSchema, type TransactionView } from "@/lib/schemas";

type ToolResult = {
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function resultSummary(result: ToolResult | null) {
  const value = result?.structuredContent?.summary;
  return typeof value === "string" ? value : null;
}

export function transactionViewFromResult(result: ToolResult | null) {
  const parsed = transactionViewSchema.safeParse(
    result?.structuredContent?.transaction_view,
  );
  return parsed.success ? parsed.data : null;
}

function StatusCard({ result }: { result: ToolResult | null }) {
  const isError = result?.isError === true;
  const summary = resultSummary(result);

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {isError ? (
            <CircleAlert
              className="size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
          ) : null}
          <CardTitle className="wrap-break-word">
            {result === null
              ? "正在載入交易…"
              : isError
                ? "無法顯示交易"
                : "交易資訊不可用"}
          </CardTitle>
          {isError ? <Badge variant="destructive">未完成</Badge> : null}
        </div>
      </CardHeader>
      {summary ? (
        <CardContent>
          <p className="wrap-break-word text-sm text-muted-foreground whitespace-pre-wrap">
            {summary}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}

export function TransactionWidget({ result }: { result: ToolResult | null }) {
  const view = transactionViewFromResult(result);

  if (!view) return <StatusCard result={result} />;

  return (
    <div className="transaction-widget-grid" data-operation={view.operation}>
      {view.items.map((item, index) => (
        <TransactionDisplay
          key={item.entry.id ?? `${item.entry.date}-${index}`}
          entry={item.entry}
          state={item.state}
          compact
        />
      ))}
    </div>
  );
}

export type { ToolResult, TransactionView };
