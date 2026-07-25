import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { accountTypeLabels } from "@/lib/account";
import { formatMoney, formatShortDate } from "@/lib/format";
import type { EntryResponse } from "@/lib/schemas";

export function entryDisplayAmount(entry: EntryResponse) {
  const expense = entry.postings
    .filter((posting) => posting.account.type === "expense")
    .reduce((sum, posting) => sum + posting.amount_minor, 0);
  if (expense !== 0) return expense;

  const income = entry.postings
    .filter((posting) => posting.account.type === "income")
    .reduce((sum, posting) => sum - posting.amount_minor, 0);
  if (income !== 0) return income;

  return Math.max(
    ...entry.postings.map((posting) => Math.abs(posting.amount_minor)),
  );
}

export function EntrySummary({
  entry,
  action,
}: {
  entry: EntryResponse;
  action?: ReactNode;
}) {
  return (
    <>
      <CardHeader className="gap-1 pb-2">
        <CardTitle className="truncate">{entry.description}</CardTitle>
        <CardDescription>{formatShortDate(entry.date)}</CardDescription>
        <CardAction>
          <p className="shrink-0 font-medium tabular-nums">
            {formatMoney(entryDisplayAmount(entry))}
          </p>
        </CardAction>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {entry.postings.slice(0, 3).map((posting) => (
            <Badge key={posting.id} variant="secondary">
              {accountTypeLabels[posting.account.type]} · {posting.account.name}
            </Badge>
          ))}
        </div>
        {action}
      </CardContent>
    </>
  );
}

export function EntryCard({
  entry,
  listSearch = "",
}: {
  entry: EntryResponse;
  listSearch?: string;
}) {
  return (
    <Link
      to={{ pathname: `/entries/${entry.id}`, search: listSearch }}
      aria-label={`查看 ${entry.description}`}
      className="touch-surface block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="touch-rebound group-active:bg-muted/40">
        <EntrySummary
          entry={entry}
          action={
            <span className="flex size-7 items-center justify-center text-muted-foreground">
              <ChevronRight aria-hidden="true" />
            </span>
          }
        />
      </Card>
    </Link>
  );
}

export function EntryTableRow({
  entry,
  listSearch = "",
}: {
  entry: EntryResponse;
  listSearch?: string;
}) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {formatShortDate(entry.date)}
      </TableCell>
      <TableCell>
        <Link
          to={{ pathname: `/entries/${entry.id}`, search: listSearch }}
          data-slot="entry-link"
          className="touch-press inline-flex items-center rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {entry.description}
        </Link>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {entry.postings.slice(0, 2).map((posting) => (
            <Badge key={posting.id} variant="outline">
              {accountTypeLabels[posting.account.type]} · {posting.account.name}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatMoney(entryDisplayAmount(entry))}
      </TableCell>
      <TableCell className="w-10">
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          aria-label={`查看 ${entry.description}`}
        >
          <Link to={{ pathname: `/entries/${entry.id}`, search: listSearch }}>
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
