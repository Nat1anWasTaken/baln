import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { API_BASE_URL } from "@/lib/api-client";
import { DashboardPage } from "@/pages/dashboard-page";
import { server } from "@/test/server";

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
  it("distinguishes equal asset and liability balances", async () => {
    const assetId = "01980000-0000-7000-8000-000000000001";
    const liabilityId = "01980000-0000-7000-8000-000000000002";
    const accountBase = {
      archived: false,
      created_at: "2026-07-24T00:00:00Z",
      updated_at: "2026-07-24T00:00:00Z",
    };

    server.use(
      http.get(`${API_BASE_URL}/reports/monthly`, () =>
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
});
