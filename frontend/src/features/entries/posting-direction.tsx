import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import type { ComboboxOption } from "@/components/ui/combobox";

export type PostingDirection = "debit" | "credit";

export const postingDirectionLabels: Record<PostingDirection, string> = {
  debit: "借方",
  credit: "貸方",
};

const directionTextClasses: Record<PostingDirection, string> = {
  debit: "text-finance-debit",
  credit: "text-finance-credit",
};

const directionBadgeClasses: Record<PostingDirection, string> = {
  debit: "border-finance-debit/20 bg-finance-debit/10 text-finance-debit",
  credit: "border-finance-credit/20 bg-finance-credit/10 text-finance-credit",
};

export function postingDirectionFromAmount(
  amountMinor: number,
): PostingDirection {
  if (amountMinor > 0) return "debit";
  if (amountMinor < 0) return "credit";
  throw new RangeError("Posting amount cannot be zero");
}

export function PostingDirectionText({
  direction,
  suffix = "",
  ...props
}: Omit<ComponentProps<"span">, "children" | "className"> & {
  direction: PostingDirection;
  suffix?: string;
}) {
  return (
    <span
      {...props}
      data-direction={direction}
      className={directionTextClasses[direction]}
    >
      {postingDirectionLabels[direction]}
      {suffix}
    </span>
  );
}

export function PostingDirectionBadge({
  direction,
  ...props
}: Omit<ComponentProps<typeof Badge>, "variant" | "children" | "className"> & {
  direction: PostingDirection;
}) {
  return (
    <Badge
      {...props}
      variant="outline"
      data-direction={direction}
      className={directionBadgeClasses[direction]}
    >
      {postingDirectionLabels[direction]}
    </Badge>
  );
}

export const postingDirectionOptions: ComboboxOption[] = (
  ["debit", "credit"] as const
).map((direction) => ({
  value: direction,
  label: postingDirectionLabels[direction],
  content: <PostingDirectionText direction={direction} />,
}));
