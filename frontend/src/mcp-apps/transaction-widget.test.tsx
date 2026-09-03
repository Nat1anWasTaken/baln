import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  TransactionWidget,
  transactionViewFromResult,
} from "@/mcp-apps/transaction-widget";

const transactionView = {
  version: 1,
  operation: "create",
  items: [
    {
      state: "created",
      entry: {
        id: "018f0000-0000-7000-8000-000000000001",
        date: "2026-09-02",
        description: "Lunch",
        note: null,
        excluded_from_budgets: false,
        postings: [
          {
            account: {
              id: "018f0000-0000-7000-8000-000000000002",
              key: "asset.cash",
              name: "Cash",
              type: "asset",
            },
            amount_minor: -320,
            memo: null,
          },
          {
            account: {
              id: "018f0000-0000-7000-8000-000000000003",
              key: "expense.restaurant",
              name: "Restaurant",
              type: "expense",
            },
            amount_minor: 320,
            memo: null,
          },
        ],
      },
    },
  ],
};

describe("TransactionWidget", () => {
  it("renders a valid structured tool result without controls", () => {
    render(
      <TransactionWidget
        result={{ structuredContent: { transaction_view: transactionView } }}
      />,
    );

    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("已建立")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows passive tool errors and malformed results safely", () => {
    const { rerender } = render(
      <TransactionWidget
        result={{
          isError: true,
          structuredContent: { summary: "No transaction was created." },
        }}
      />,
    );
    expect(screen.getByText("無法顯示交易")).toBeInTheDocument();
    expect(screen.getByText("No transaction was created.")).toBeInTheDocument();

    rerender(
      <TransactionWidget
        result={{ structuredContent: { transaction_view: { version: 99 } } }}
      />,
    );
    expect(screen.getByText("交易資訊不可用")).toBeInTheDocument();
  });

  it("rejects zero-value postings in the display payload", () => {
    const invalid = structuredClone(transactionView);
    invalid.items[0].entry.postings[0].amount_minor = 0;

    expect(
      transactionViewFromResult({
        structuredContent: { transaction_view: invalid },
      }),
    ).toBeNull();
  });
});
