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
    user: { id: userId },
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

function installDefaultHandlers(reportUrls: string[] = []) {
  server.use(
    http.get(`${API_BASE_URL}/reports/summary`, ({ request }) => {
      reportUrls.push(request.url);
      const params = new URL(request.url).searchParams;
      return HttpResponse.json({
        date_from: params.get("date_from"),
        date_to: params.get("date_to"),
        income_minor: 50_000,
        expense_minor: 12_000,
        net_minor: 38_000,
        income_accounts: [],
        expense_accounts: [],
      });
    }),
    http.get(`${API_BASE_URL}/reports/position`, () =>
      HttpResponse.json({
        as_of: "2026-07-27",
        asset_minor: 80_000,
        liability_minor: 20_000,
        net_worth_minor: 60_000,
      }),
    ),
    http.get(`${API_BASE_URL}/entries`, () =>
      HttpResponse.json({ items: [], next_cursor: null }),
    ),
  );
}

describe("dashboard insights", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows aggregate assets, liabilities, and net worth", async () => {
    installDefaultHandlers();
    renderPage();

    expect(await screen.findByText("財務狀況")).toBeVisible();
    expect(
      screen.getByText("資產").parentElement?.parentElement,
    ).toHaveTextContent("TWD 80,000");
    expect(
      screen.getByText("負債").parentElement?.parentElement,
    ).toHaveTextContent("TWD 20,000");
    expect(
      screen.getByText("淨值").parentElement?.parentElement,
    ).toHaveTextContent("TWD 60,000");
  });

  it("uses the saved start day and requests the exact accounting period", async () => {
    window.localStorage.setItem(`baln:month-start-day:${userId}`, "26");
    const bounds = monthPeriodBounds(currentPeriodMonth(26), 26);
    const reportUrls: string[] = [];
    installDefaultHandlers(reportUrls);

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
      expect(
        reportUrls.some((url) => {
          const params = new URL(url).searchParams;
          return (
            params.get("date_from") === bounds.dateFrom &&
            params.get("date_to") === bounds.dateTo
          );
        }),
      ).toBe(true);
    });
  });
});
