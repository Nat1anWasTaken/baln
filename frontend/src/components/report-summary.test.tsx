import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CategoryRanking, SummaryCards } from "@/components/report-summary";
import type { PeriodSummary } from "@/lib/schemas";

const summary: PeriodSummary = {
  date_from: "2026-07-01",
  date_to: "2026-08-01",
  income_minor: 50_000,
  expense_minor: 12_000,
  net_minor: 38_000,
  income_accounts: [],
  expense_accounts: [],
};

describe("financial summary semantics", () => {
  it("prioritizes spending and shows comparisons and savings rate", () => {
    render(
      <SummaryCards
        summary={summary}
        comparison={{
          ...summary,
          income_minor: 40_000,
          expense_minor: 15_000,
          net_minor: 25_000,
        }}
      />,
    );

    const expectations = [
      ["支出", "expense", "text-finance-expense"],
      ["收入", "income", "text-finance-income"],
      ["收支結餘", "net", "text-finance-net"],
    ] as const;

    for (const [label, tone, className] of expectations) {
      const card = screen.getByText(label).closest('[data-slot="card"]');
      expect(card).toHaveAttribute("data-finance-tone", tone);
      expect(card?.querySelector(".text-2xl")).toHaveClass(className);
    }
    expect(screen.getByText("儲蓄率 76.0%")).toBeVisible();
  });

  it("ranks categories with share, comparison, and an entries drill-through", () => {
    render(
      <MemoryRouter>
        <CategoryRanking
          accounts={[
            {
              account_id: "00000000-0000-4000-8000-000000000001",
              account_key: "expense.food",
              account_name: "餐飲",
              account_type: "expense",
              total_minor: 6_000,
            },
          ]}
          previousAccounts={[
            {
              account_id: "00000000-0000-4000-8000-000000000001",
              account_key: "expense.food",
              account_name: "餐飲",
              account_type: "expense",
              total_minor: 4_000,
            },
          ]}
          total={12_000}
          tone="expense"
          dateFrom="2026-07-01"
          dateTo="2026-08-01"
        />
      </MemoryRouter>,
    );

    const categoryLink = screen.getByRole("link", { name: /餐飲/ });
    expect(categoryLink).toHaveTextContent("占比 50.0%");
    expect(categoryLink).toHaveTextContent("+50.0%");
    expect(categoryLink).toHaveAttribute(
      "href",
      "/entries?from=2026-07-01&to=2026-07-31&account=expense.food",
    );
  });
});
