import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { BudgetCard } from "@/components/budget-card";
import { Button } from "@/components/ui/button";
import type { BudgetStatus } from "@/lib/schemas";

const budget: BudgetStatus = {
  id: "01980000-0000-7000-8000-000000000050",
  name: "日常開銷",
  amount_minor: 10_000,
  start_date: "2026-07-01",
  period_count: 1,
  period_unit: "month",
  rollover_mode: "accumulate",
  accounts: [
    {
      id: "01980000-0000-7000-8000-000000000001",
      key: "asset.cash",
      name: "現金",
      type: "asset",
      archived: false,
    },
  ],
  show_on_overview: true,
  overview_position: 0,
  as_of: "2026-07-24",
  period_from: "2026-07-01",
  period_to: "2026-08-01",
  carry_in_minor: 2_000,
  available_minor: 12_000,
  spent_minor: 7_000,
  remaining_minor: 5_000,
  status: "active",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

describe("BudgetCard", () => {
  it("separates current unused and previous rollover amounts", () => {
    render(<BudgetCard budget={budget} />);
    expect(screen.getByText("已使用")).toBeVisible();
    expect(screen.getByText("可用餘額")).toBeVisible();
    expect(screen.getByText("當期剩餘")).toBeVisible();
    expect(screen.getByText("往期沿襲")).toBeVisible();
    expect(screen.getByText(/本期額度/)).toHaveTextContent("TWD 10,000");
    expect(screen.getByText(/總額度/)).toHaveTextContent("TWD 12,000");
    expect(screen.getByText("TWD 3,000")).toHaveClass("text-finance-income");
    expect(screen.getByText("TWD 2,000")).toHaveClass("text-finance-rollover");
    expect(screen.getByText("TWD 3,000").parentElement).toHaveClass(
      "whitespace-nowrap",
    );
    expect(screen.getByText("TWD 3,000").parentElement).not.toHaveClass(
      "flex-wrap",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "7000",
    );
    expect(
      screen.getByRole("progressbar").getAttribute("aria-valuetext"),
    ).toContain("加上往期沿襲");
  });

  it("labels negative rollover as a previous-period deduction", () => {
    render(
      <BudgetCard
        budget={{
          ...budget,
          carry_in_minor: -2_000,
          available_minor: 8_000,
          spent_minor: 7_000,
          remaining_minor: 1_000,
        }}
      />,
    );
    expect(screen.getByText("往期超支抵扣")).toHaveClass("text-destructive");
    expect(screen.getByText("TWD 2,000")).toHaveClass("text-destructive");
    expect(screen.getByText("TWD 3,000").parentElement).toHaveTextContent(
      "TWD 3,000−TWD 2,000",
    );
  });

  it.each(["reset", "surplus_only"] as const)(
    "omits rollover details for %s without carried value",
    (rolloverMode) => {
      render(
        <BudgetCard
          budget={{
            ...budget,
            rollover_mode: rolloverMode,
            carry_in_minor: 0,
            available_minor: 10_000,
            remaining_minor: 3_000,
          }}
        />,
      );

      expect(screen.getByText("當期剩餘")).toBeVisible();
      expect(screen.queryByText("往期沿襲")).not.toBeInTheDocument();
      expect(screen.queryByText("往期超支抵扣")).not.toBeInTheDocument();
      expect(screen.getByText("TWD 3,000")).toHaveClass("text-finance-income");
    },
  );

  it("uses rollover after the current period allowance is spent", () => {
    render(
      <BudgetCard
        budget={{
          ...budget,
          spent_minor: 11_000,
          remaining_minor: 1_000,
        }}
      />,
    );
    expect(screen.getByText("TWD 0").parentElement).toHaveTextContent(
      "TWD 0+TWD 1,000",
    );
  });

  it("uses explicit overspent language without relying on color", () => {
    render(
      <BudgetCard
        budget={{
          ...budget,
          spent_minor: 15_000,
          remaining_minor: -3_000,
          status: "overspent",
        }}
      />,
    );
    expect(screen.getAllByText("已超支").length).toBeGreaterThan(0);
    expect(screen.getByText("超支")).toBeVisible();
    expect(screen.getByText("TWD 3,000")).toBeVisible();
  });

  it("groups management controls in the linked card footer", () => {
    render(
      <MemoryRouter>
        <BudgetCard
          budget={budget}
          to="/budgets/budget-id"
          footer={<Button type="button">編輯預算</Button>}
        />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "查看預算：日常開銷" });
    const button = screen.getByRole("button", { name: "編輯預算" });

    expect(link).not.toContainElement(button);
    expect(link.closest("[data-slot=card]")).toBe(
      button.closest("[data-slot=card]"),
    );
    expect(button.closest("[data-slot=card-footer]")).toBeVisible();
  });
});
