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
  it("leads with the available balance and explains rollover below it", () => {
    render(<BudgetCard budget={budget} />);
    expect(screen.getByText("可用餘額")).toBeVisible();
    const available = screen.getByText("TWD 5,000");
    expect(available).toHaveAttribute("data-budget-available-amount");
    expect(available).toHaveClass("text-finance-net", "whitespace-nowrap");

    const breakdown = document.querySelector(
      "[data-budget-remaining-breakdown]",
    );
    expect(breakdown).toHaveTextContent(
      "當期剩餘 TWD 3,000+往期沿襲 TWD 2,000",
    );
    expect(screen.getByText("TWD 2,000")).toHaveClass("text-finance-rollover");

    expect(screen.getByText(/^已使用/)).toHaveTextContent("已使用 TWD 7,000");
    expect(screen.getByText(/總額度/)).toHaveTextContent("TWD 12,000");
    expect(screen.queryByText(/本期額度/)).not.toBeInTheDocument();

    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuenow", "7000");
    expect(progress).toHaveAttribute("aria-valuemax", "12000");
    expect(progress.lastElementChild).toHaveClass("bg-finance-net");
    expect(progress.getAttribute("aria-valuetext")).toMatch(
      /可用餘額 TWD\s5,000/,
    );
    expect(progress.getAttribute("aria-valuetext")).toContain("加上往期沿襲");
  });

  it("shows the net balance first when earlier overspending is deducted", () => {
    render(
      <BudgetCard
        budget={{
          ...budget,
          amount_minor: 400,
          carry_in_minor: -129,
          available_minor: 271,
          spent_minor: 0,
          remaining_minor: 271,
        }}
      />,
    );
    expect(screen.getByText("TWD 271")).toHaveClass("text-finance-net");
    expect(
      document.querySelector("[data-budget-remaining-breakdown]"),
    ).toHaveTextContent("當期剩餘 TWD 400−往期超支抵扣 TWD 129");
    expect(screen.getByText("TWD 129")).toHaveClass("text-destructive");
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

      expect(screen.getByText("TWD 3,000")).toHaveClass("text-finance-net");
      expect(
        document.querySelector("[data-budget-remaining-breakdown]"),
      ).not.toBeInTheDocument();
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
    expect(
      document.querySelector("[data-budget-available-amount]"),
    ).toHaveTextContent("TWD 1,000");
    expect(
      document.querySelector("[data-budget-remaining-breakdown]"),
    ).toHaveTextContent("當期剩餘 TWD 0+往期沿襲 TWD 1,000");
  });

  it("leaves the bar empty when nothing is spent or available", () => {
    render(
      <BudgetCard
        budget={{
          ...budget,
          carry_in_minor: 0,
          amount_minor: 0,
          available_minor: 0,
          spent_minor: 0,
          remaining_minor: 0,
        }}
      />,
    );
    const bars = screen.getByRole("progressbar").children;
    expect((bars[0] as HTMLElement).style.width).toBe("0%");
    expect((bars[1] as HTMLElement).style.width).toBe("0%");
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
    expect(screen.getByText("TWD 3,000")).toHaveClass("text-destructive");
    expect(
      document.querySelector("[data-budget-remaining-breakdown]"),
    ).not.toBeInTheDocument();
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
