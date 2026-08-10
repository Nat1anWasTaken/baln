import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BudgetCard } from "@/components/budget-card";
import type { BudgetStatus } from "@/lib/schemas";

const budget: BudgetStatus = {
  id: "01980000-0000-7000-8000-000000000050",
  name: "日常開銷",
  amount_minor: 10_000,
  start_date: "2026-07-01",
  period_count: 1,
  period_unit: "month",
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
  it("labels spent, unused, base, and rollover amounts", () => {
    render(<BudgetCard budget={budget} />);
    expect(screen.getByText("已使用")).toBeVisible();
    expect(screen.getByText("尚未使用")).toBeVisible();
    expect(screen.getByText(/基本額度/)).toHaveTextContent("TWD 10,000");
    expect(screen.getByText(/累計/)).toHaveTextContent("TWD 2,000");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "7000",
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
});
