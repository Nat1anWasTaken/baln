import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "@/lib/api-client";
import { BudgetDetailPage } from "@/pages/budget-detail-page";
import { server } from "@/test/server";

vi.mock("@/auth/auth-context", () => ({ useOfflineReadOnly: () => false }));

const budgetId = "01980000-0000-7000-8000-000000000101";

const detail = {
  budget: {
    id: budgetId,
    name: "每月餐飲",
    amount_minor: 10_000,
    start_date: "2026-08-01",
    period_count: 1,
    period_unit: "month",
    rollover_mode: "accumulate",
    accounts: [
      {
        id: "01980000-0000-7000-8000-000000000111",
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
    carry_in_minor: 1_000,
    available_minor: 11_000,
    spent_minor: 3_500,
    remaining_minor: 7_500,
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-11T00:00:00Z",
  },
  period_offset: 0,
  period_kind: "current",
  has_previous: true,
  has_next: false,
  pace: {
    total_days: 31,
    elapsed_days: 11,
    remaining_days: 20,
    spent_through_as_of_minor: 3_000,
    future_spent_minor: 500,
    average_daily_spend_minor: 273,
    spendable_per_day_minor: 364,
  },
  trend: {
    bucket_days: 1,
    points: [
      {
        date_from: "2026-08-01",
        date_to: "2026-08-02",
        spent_minor: 500,
        remaining_minor: 10_500,
      },
      {
        date_from: "2026-08-02",
        date_to: "2026-08-03",
        spent_minor: 1_000,
        remaining_minor: 10_000,
      },
    ],
  },
};

const days = {
  items: [
    {
      date: "2026-08-01",
      spent_minor: 500,
      remaining_minor: 10_500,
      entry_count: 1,
      is_future: false,
    },
    {
      date: "2026-08-12",
      spent_minor: 500,
      remaining_minor: 7_000,
      entry_count: 1,
      is_future: true,
    },
  ],
  next_cursor: null,
};

function renderPage(
  initialEntry:
    | string
    | {
        pathname: string;
        search?: string;
        state: { budgetReturnTo: string };
      } = "/budgets/" + budgetId,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/budgets/:budgetId" element={<BudgetDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("BudgetDetailPage", () => {
  it("renders period summary, pace, trend, and future-day wording", async () => {
    server.use(
      http.get(`${API_BASE_URL}/accounts`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/budgets/${budgetId}/details`, () =>
        HttpResponse.json(detail),
      ),
      http.get(`${API_BASE_URL}/budgets/${budgetId}/days`, () =>
        HttpResponse.json(days),
      ),
    );

    renderPage();

    expect(await screen.findByText("每月餐飲")).toBeVisible();
    expect(screen.getByText("可用額度")).toBeVisible();
    expect(screen.getByText("每日可用")).toBeVisible();
    expect((await screen.findAllByText("未來日期")).length).toBeGreaterThan(0);
    expect(screen.getByText(/未來 TWD 500/)).toBeVisible();
    expect(screen.getByLabelText("預算支出與剩餘趨勢圖")).toBeInTheDocument();
  });

  it("returns to the overview when opened from an overview budget card", async () => {
    server.use(
      http.get(`${API_BASE_URL}/accounts`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/budgets/${budgetId}/details`, () =>
        HttpResponse.json(detail),
      ),
      http.get(`${API_BASE_URL}/budgets/${budgetId}/days`, () =>
        HttpResponse.json(days),
      ),
    );

    renderPage({
      pathname: `/budgets/${budgetId}`,
      state: { budgetReturnTo: "/" },
    });

    expect(
      await screen.findByRole("link", { name: "返回總覽" }),
    ).toHaveAttribute("href", "/");
  });

  it("defaults direct budget links to the budgets page", async () => {
    server.use(
      http.get(`${API_BASE_URL}/accounts`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/budgets/${budgetId}/details`, () =>
        HttpResponse.json(detail),
      ),
      http.get(`${API_BASE_URL}/budgets/${budgetId}/days`, () =>
        HttpResponse.json(days),
      ),
    );

    renderPage();

    expect(
      await screen.findByRole("link", { name: "返回預算" }),
    ).toHaveAttribute("href", "/budgets");
  });

  it("links daily rows to the filtered transaction view", async () => {
    server.use(
      http.get(`${API_BASE_URL}/accounts`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/budgets/${budgetId}/details`, () =>
        HttpResponse.json(detail),
      ),
      http.get(`${API_BASE_URL}/budgets/${budgetId}/days`, () =>
        HttpResponse.json(days),
      ),
    );

    renderPage();
    await screen.findByText("每月餐飲");

    expect(
      await screen.findByRole("link", {
        name: "查看 2026/08/01 的 1 筆交易",
      }),
    ).toHaveAttribute(
      "href",
      `/entries?from=2026-08-01&to=2026-08-01&budget=${budgetId}`,
    );
  });

  it("uses a non-positive URL period and exposes the previous-period link", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API_BASE_URL}/accounts`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/budgets/${budgetId}/details`, () =>
        HttpResponse.json({
          ...detail,
          period_offset: -1,
          has_previous: true,
          has_next: true,
        }),
      ),
      http.get(`${API_BASE_URL}/budgets/${budgetId}/days`, () =>
        HttpResponse.json(days),
      ),
    );

    renderPage({
      pathname: `/budgets/${budgetId}`,
      search: "?period=-1",
      state: { budgetReturnTo: "/" },
    });
    await screen.findByText("每月餐飲");

    expect(
      screen.getByRole("link", { name: "查看上一期預算" }),
    ).toHaveAttribute("href", `/budgets/${budgetId}?period=-2`);
    expect(
      screen.getByRole("link", { name: "查看下一期預算" }),
    ).toHaveAttribute("href", `/budgets/${budgetId}`);

    await user.click(screen.getByRole("link", { name: "查看上一期預算" }));

    expect(
      await screen.findByRole("link", { name: "返回總覽" }),
    ).toHaveAttribute("href", "/");
  });
});
