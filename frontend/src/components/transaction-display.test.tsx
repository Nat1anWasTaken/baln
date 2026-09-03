import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TransactionDisplay } from "@/components/transaction-display";
import type { TransactionDisplayEntry } from "@/lib/schemas";

const entry: TransactionDisplayEntry = {
  id: "018f0000-0000-7000-8000-000000000001",
  date: "2026-09-02",
  description: "A very long restaurant transaction that must remain readable",
  note: "A note that can wrap across narrow chat containers.",
  excluded_from_budgets: true,
  postings: [
    {
      id: "018f0000-0000-7000-8000-000000000002",
      account: {
        id: "018f0000-0000-7000-8000-000000000003",
        key: "asset.cash_with_an_intentionally_long_account_key",
        name: "Cash account with a long display name",
        type: "asset",
      },
      amount_minor: -320,
      memo: "Paid in cash",
    },
    {
      id: "018f0000-0000-7000-8000-000000000004",
      account: {
        id: "018f0000-0000-7000-8000-000000000005",
        key: "expense.restaurant",
        name: "Restaurant",
        type: "expense",
      },
      amount_minor: 320,
      memo: null,
    },
  ],
  created_at: "2026-09-02T08:00:00Z",
  updated_at: "2026-09-02T08:30:00Z",
};

describe("TransactionDisplay", () => {
  it("reuses the responsive transaction card for compact MCP rendering", () => {
    const { container } = render(
      <TransactionDisplay entry={entry} state="updated" compact />,
    );

    expect(screen.getByText(entry.description)).toBeInTheDocument();
    expect(screen.getByText("已更新")).toBeInTheDocument();
    expect(screen.getByText("不計入預算")).toBeInTheDocument();
    expect(
      screen.getByText("Cash account with a long display name"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("TWD 320")).toHaveLength(2);
    expect(container.querySelector("[data-transaction-display]")).toHaveClass(
      "@container/transaction",
      "min-w-0",
    );
    expect(container.querySelector("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the established responsive table on the full entry page", () => {
    render(<TransactionDisplay entry={entry} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("已更新")).not.toBeInTheDocument();
  });
});
