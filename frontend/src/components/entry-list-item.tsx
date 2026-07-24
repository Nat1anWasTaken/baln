import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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

export function EntryCard({ entry }: { entry: EntryResponse }) {
  return (
    <Card>
      <CardHeader className="gap-1 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{entry.description}</CardTitle>
            <CardDescription>{formatShortDate(entry.date)}</CardDescription>
          </div>
          <p className="shrink-0 font-medium tabular-nums">
            {formatMoney(entryDisplayAmount(entry))}
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {entry.postings.slice(0, 3).map((posting) => (
            <Badge key={posting.id} variant="secondary">
              {accountTypeLabels[posting.account.type]} · {posting.account.name}
            </Badge>
          ))}
        </div>
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          aria-label={`查看 ${entry.description}`}
        >
          <Link to={`/entries/${entry.id}`}>
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function EntryTableRow({ entry }: { entry: EntryResponse }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {formatShortDate(entry.date)}
      </TableCell>
      <TableCell>
        <Link
          to={`/entries/${entry.id}`}
          className="font-medium hover:underline"
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
          <Link to={`/entries/${entry.id}`}>
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
