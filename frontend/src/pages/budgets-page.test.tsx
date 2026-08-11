import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { API_BASE_URL } from "@/lib/api-client";
import type { BudgetStatus } from "@/lib/schemas";
import { BudgetsPage } from "@/pages/budgets-page";
import { server } from "@/test/server";

const budgets: BudgetStatus[] = [
  {
    id: "01980000-0000-7000-8000-000000000001",
    name: "每月餐飲",
    amount_minor: 10_000,
    start_date: "2026-08-01",
    period_count: 1,
    period_unit: "month",
    accounts: [
      {
        id: "01980000-0000-7000-8000-000000000011",
        key: "expense.food",
        name: "餐飲支出",
        type: "expense",
        archived: false,
      },
    ],
    show_on_overview: true,
    overview_position: 0,
    as_of: "2026-08-11",
    period_from: "2026-08-01",
    period_to: "2026-09-01",
    spent_minor: 2_000,
    carry_in_minor: 0,
    available_minor: 10_000,
    remaining_minor: 8_000,
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "01980000-0000-7000-8000-000000000002",
    name: "交通費",
    amount_minor: 5_000,
    start_date: "2026-08-01",
    period_count: 1,
    period_unit: "month",
    accounts: [
      {
        id: "01980000-0000-7000-8000-000000000012",
        key: "expense.transport",
        name: "交通支出",
        type: "expense",
        archived: false,
      },
    ],
    show_on_overview: false,
    overview_position: null,
    as_of: "2026-08-11",
    period_from: "2026-08-01",
    period_to: "2026-09-01",
    spent_minor: 1_000,
    carry_in_minor: 0,
    available_minor: 5_000,
    remaining_minor: 4_000,
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <BudgetsPage />
    </QueryClientProvider>,
  );
}

describe("budget search", () => {
  it("filters budgets by budget name, account name, and account key", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API_BASE_URL}/budgets`, () => HttpResponse.json(budgets)),
      http.get(`${API_BASE_URL}/accounts`, () => HttpResponse.json([])),
    );

    renderPage();
    const search = screen.getByRole("textbox", { name: "搜尋預算" });
    expect(await screen.findAllByText("每月餐飲")).not.toHaveLength(0);
    expect(screen.getAllByText("交通費")).not.toHaveLength(0);

    await user.type(search, "expense.food");
    expect(screen.getAllByText("每月餐飲")).not.toHaveLength(0);
    expect(screen.queryByText("交通費")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "交通支出");
    expect(screen.queryByText("每月餐飲")).not.toBeInTheDocument();
    expect(screen.getAllByText("交通費")).not.toHaveLength(0);

    await user.clear(search);
    await user.type(search, "不存在");
    expect(screen.getByText("找不到符合的預算")).toBeInTheDocument();
  });
});
