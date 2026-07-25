import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "@/lib/api-client";
import {
  currentPeriodMonth,
  formatShortDate,
  monthPeriodBounds,
  toInclusiveDate,
} from "@/lib/format";
import { DashboardPage } from "@/pages/dashboard-page";
import { server } from "@/test/server";

const userId = "01980000-0000-7000-8000-000000000099";

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    user: { id: "01980000-0000-7000-8000-000000000099" },
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("dashboard account balances", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("distinguishes equal asset and liability balances", async () => {
    const assetId = "01980000-0000-7000-8000-000000000001";
    const liabilityId = "01980000-0000-7000-8000-000000000002";
    const accountBase = {
      archived: false,
      created_at: "2026-07-24T00:00:00Z",
      updated_at: "2026-07-24T00:00:00Z",
    };

    server.use(
      http.get(`${API_BASE_URL}/reports/summary`, () =>
        HttpResponse.json({
          date_from: "2026-07-01",
          date_to: "2026-08-01",
          income_minor: 0,
          expense_minor: 0,
          net_minor: 0,
          income_accounts: [],
          expense_accounts: [],
        }),
      ),
      http.get(`${API_BASE_URL}/accounts`, () =>
        HttpResponse.json([
          {
            ...accountBase,
            id: assetId,
            key: "asset.cash",
            name: "現金",
            type: "asset",
          },
          {
            ...accountBase,
            id: liabilityId,
            key: "liability.card",
            name: "信用卡",
            type: "liability",
          },
        ]),
      ),
      http.get(`${API_BASE_URL}/accounts/:id/balance`, ({ params }) =>
        HttpResponse.json({
          account_id: params.id,
          account_key: params.id === assetId ? "asset.cash" : "liability.card",
          as_of: "2026-07-25",
          ledger_balance_minor: 8_200,
          display_balance_minor: 8_200,
        }),
      ),
      http.get(`${API_BASE_URL}/entries`, () =>
        HttpResponse.json({ items: [], next_cursor: null }),
      ),
    );

    renderPage();

    expect(await screen.findByText("資產")).toBeVisible();
    expect(screen.getByText("負債")).toBeVisible();
    await waitFor(() => {
      expect(screen.getByLabelText(/^資產餘額 /)).toHaveTextContent("8,200");
      expect(screen.getByLabelText(/^負債餘額 /)).toHaveTextContent("8,200");
    });
  });

  it("uses the saved start day and shows the exact period", async () => {
    window.localStorage.setItem(`baln:month-start-day:${userId}`, "26");
    const bounds = monthPeriodBounds(currentPeriodMonth(26), 26);
    let reportUrl = "";

    server.use(
      http.get(`${API_BASE_URL}/reports/summary`, ({ request }) => {
        reportUrl = request.url;
        return HttpResponse.json({
          date_from: bounds.dateFrom,
          date_to: bounds.dateTo,
          income_minor: 0,
          expense_minor: 0,
          net_minor: 0,
          income_accounts: [],
          expense_accounts: [],
        });
      }),
      http.get(`${API_BASE_URL}/accounts`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/entries`, () =>
        HttpResponse.json({ items: [], next_cursor: null }),
      ),
    );

    renderPage();

    expect(await screen.findByText("每月 26 日開始")).toBeVisible();
    expect(
      screen.getByText(
        `${formatShortDate(bounds.dateFrom)}–${formatShortDate(
          toInclusiveDate(bounds.dateTo),
        )}`,
      ),
    ).toBeVisible();
    await waitFor(() => {
      const params = new URL(reportUrl).searchParams;
      expect(params.get("date_from")).toBe(bounds.dateFrom);
      expect(params.get("date_to")).toBe(bounds.dateTo);
    });
  });
});
