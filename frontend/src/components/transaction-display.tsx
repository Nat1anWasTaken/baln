import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PostingDirectionBadge,
  PostingDirectionText,
  postingDirectionFromAmount,
} from "@/features/entries/posting-direction";
import { accountTypeLabels } from "@/lib/account";
import { formatLedgerDate, formatMoney, formatTimestamp } from "@/lib/format";
import type {
  TransactionDisplayEntry,
  TransactionViewItemState,
} from "@/lib/schemas";

const stateLabels: Record<TransactionViewItemState, string> = {
  existing: "現有交易",
  created: "已建立",
  replayed: "已存在",
  updated: "已更新",
  proposed: "交易草稿",
};

function postingKey(
  posting: TransactionDisplayEntry["postings"][number],
  index: number,
) {
  return (
    posting.id ?? `${posting.account.key}-${posting.amount_minor}-${index}`
  );
}

function PostingCards({ entry }: { entry: TransactionDisplayEntry }) {
  return (
    <div className="grid gap-2 @xl/transaction:grid-cols-2">
      {entry.postings.map((posting, index) => (
        <div
          key={postingKey(posting, index)}
          className="min-w-0 rounded-2xl bg-input/30 p-3 @sm/transaction:p-4"
        >
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-32 flex-1">
              <p className="wrap-break-word font-medium">
                {posting.account.name}
              </p>
              <p className="wrap-break-word text-xs text-muted-foreground">
                {posting.account.key}
              </p>
            </div>
            <div className="max-w-full text-right">
              <PostingDirectionBadge
                direction={postingDirectionFromAmount(posting.amount_minor)}
              />
              <p className="mt-1 wrap-break-word font-medium tabular-nums">
                {formatMoney(Math.abs(posting.amount_minor))}
              </p>
            </div>
          </div>
          {posting.memo ? (
            <p className="mt-2 wrap-break-word text-sm text-muted-foreground whitespace-pre-wrap">
              {posting.memo}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TransactionHeader({
  entry,
  state,
  compact,
}: {
  entry: TransactionDisplayEntry;
  state?: TransactionViewItemState;
  compact: boolean;
}) {
  if (!compact) {
    return (
      <CardHeader className="min-w-0">
        <CardDescription className="wrap-break-word">
          {formatLedgerDate(entry.date)}
        </CardDescription>
        <CardTitle className="wrap-break-word text-xl">
          {entry.description}
        </CardTitle>
        {entry.excluded_from_budgets ? (
          <Badge className="w-fit" variant="outline">
            不計入預算
          </Badge>
        ) : null}
      </CardHeader>
    );
  }

  return (
    <CardHeader className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <CardDescription className="min-w-0 wrap-break-word">
          {formatLedgerDate(entry.date)}
        </CardDescription>
        <div className="flex max-w-full flex-wrap justify-end gap-1">
          {state ? (
            <Badge variant="secondary">{stateLabels[state]}</Badge>
          ) : null}
          {entry.excluded_from_budgets ? (
            <Badge variant="outline">不計入預算</Badge>
          ) : null}
        </div>
      </div>
      <CardTitle className="wrap-break-word text-xl">
        {entry.description}
      </CardTitle>
    </CardHeader>
  );
}

function TransactionBody({
  entry,
  compact,
}: {
  entry: TransactionDisplayEntry;
  compact: boolean;
}) {
  return (
    <CardContent className="grid gap-4 @sm/transaction:gap-5">
      {entry.note ? (
        <div className="min-w-0">
          <p className="mb-1 text-sm font-medium">交易備註</p>
          <p className="wrap-break-word text-sm text-muted-foreground whitespace-pre-wrap">
            {entry.note}
          </p>
        </div>
      ) : null}
      <Separator />
      <div className="min-w-0">
        <h2 className="mb-3 font-medium">分錄</h2>
        {compact ? (
          <PostingCards entry={entry} />
        ) : (
          <>
            <div className="grid gap-2 md:hidden">
              <PostingCards entry={entry} />
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>帳戶</TableHead>
                    <TableHead>類型</TableHead>
                    <TableHead>備註</TableHead>
                    <TableHead className="text-right">
                      <PostingDirectionText direction="debit" />
                    </TableHead>
                    <TableHead className="text-right">
                      <PostingDirectionText direction="credit" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entry.postings.map((posting, index) => (
                    <TableRow key={postingKey(posting, index)}>
                      <TableCell>
                        <p className="font-medium">{posting.account.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {posting.account.key}
                        </p>
                      </TableCell>
                      <TableCell>
                        {accountTypeLabels[posting.account.type]}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {posting.memo ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {posting.amount_minor > 0
                          ? formatMoney(posting.amount_minor)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {posting.amount_minor < 0
                          ? formatMoney(-posting.amount_minor)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
      {entry.created_at || entry.updated_at ? <Separator /> : null}
      {entry.created_at || entry.updated_at ? (
        <dl className="grid min-w-0 gap-2 text-xs text-muted-foreground @md/transaction:grid-cols-2">
          {entry.created_at ? (
            <div className="min-w-0">
              <dt>建立時間</dt>
              <dd className="wrap-break-word">
                {formatTimestamp(entry.created_at)}
              </dd>
            </div>
          ) : null}
          {entry.updated_at ? (
            <div className="min-w-0">
              <dt>最後更新</dt>
              <dd className="wrap-break-word">
                {formatTimestamp(entry.updated_at)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </CardContent>
  );
}

export function TransactionDisplay({
  entry,
  state,
  compact = false,
  footer,
}: {
  entry: TransactionDisplayEntry;
  state?: TransactionViewItemState;
  compact?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="@container/transaction min-w-0" data-transaction-display>
      <Card size={compact ? "sm" : "default"}>
        <TransactionHeader entry={entry} state={state} compact={compact} />
        <TransactionBody entry={entry} compact={compact} />
        {footer}
      </Card>
    </div>
  );
}
