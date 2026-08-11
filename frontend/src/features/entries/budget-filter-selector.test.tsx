import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  BudgetFilterSelector,
  type BudgetFilterSelectorProps,
} from "@/features/entries/budget-filter-selector";
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

function renderSelector(overrides: Partial<BudgetFilterSelectorProps> = {}) {
  return render(
    <BudgetFilterSelector
      budgets={[budget]}
      value="all"
      onValueChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("budget filter selector", () => {
  it("exposes an all option and budget options as single-select pills", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderSelector({ onValueChange });

    expect(screen.getByRole("radio", { name: "所有預算" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(screen.getByRole("radio", { name: "日常開銷" }));
    expect(onValueChange).toHaveBeenCalledWith(budget.id);
  });

  it("shows loading, error, and empty states", async () => {
    const retry = vi.fn();
    const { rerender } = renderSelector({ budgets: [], isLoading: true });
    expect(screen.getByLabelText("正在載入預算選項")).toBeInTheDocument();

    rerender(
      <BudgetFilterSelector
        budgets={[]}
        value={budget.id}
        onValueChange={vi.fn()}
        errorMessage="network error"
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      `目前仍依 ${budget.id} 篩選`,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "重試" }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <BudgetFilterSelector budgets={[]} value="all" onValueChange={vi.fn()} />,
    );
    expect(screen.getByText("尚未建立預算。")).toBeInTheDocument();
  });
});
