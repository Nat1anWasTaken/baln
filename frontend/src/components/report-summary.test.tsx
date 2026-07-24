import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryChart, SummaryCards } from "@/components/report-summary";
import type { PeriodSummary } from "@/lib/schemas";

const summary: PeriodSummary = {
  date_from: "2026-07-01",
  date_to: "2026-07-31",
  income_minor: 50_000,
  expense_minor: 12_000,
  net_minor: 38_000,
  income_accounts: [],
  expense_accounts: [],
};

describe("financial summary semantics", () => {
  it("gives income, expense, and net distinct visual treatments and labels", () => {
    render(<SummaryCards summary={summary} />);

    const expectations = [
      ["收入", "income", "text-finance-income"],
      ["支出", "expense", "text-finance-expense"],
      ["淨額", "net", "text-finance-net"],
    ] as const;

    for (const [label, tone, className] of expectations) {
      const card = screen.getByText(label).closest('[data-slot="card"]');

      expect(card).toHaveAttribute("data-finance-tone", tone);
      expect(card?.querySelector(".tabular-nums")).toHaveClass(className);
      expect(card?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("uses the account type to select the category chart color", () => {
    const { container } = render(
      <CategoryChart
        title="收入分類"
        description="依收入帳戶彙整"
        tone="income"
        accounts={[
          {
            account_id: "00000000-0000-4000-8000-000000000001",
            account_key: "income.salary",
            account_name: "薪資",
            account_type: "income",
            total_minor: 50_000,
          },
        ]}
      />,
    );

    expect(
      screen.getByText("收入分類").closest('[data-slot="card"]'),
    ).toHaveAttribute("data-finance-tone", "income");
    expect(container.querySelector("style")?.textContent).toContain(
      "--color-amount: var(--color-finance-income)",
    );
  });
});
