import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import { ReportsPage } from "@/pages/reports-page";
import { server } from "@/test/server";

const userId = "01980000-0000-7000-8000-000000000099";

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    user: { id: userId },
  }),
  useOfflineReadOnly: () => false,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ReportsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function installReportHandlers(reportUrls: string[]) {
  server.use(
    http.get(`${API_BASE_URL}/reports/summary`, ({ request }) => {
      reportUrls.push(request.url);
      const params = new URL(request.url).searchParams;
      return HttpResponse.json({
        date_from: params.get("date_from"),
        date_to: params.get("date_to"),
        income_minor: 0,
        expense_minor: 0,
        net_minor: 0,
        income_accounts: [],
        expense_accounts: [],
      });
    }),
    http.get(`${API_BASE_URL}/reports/trend`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      return HttpResponse.json({
        date_from: params.get("date_from"),
        date_to: params.get("date_to"),
        granularity: params.get("granularity"),
        points: [],
      });
    }),
  );
}

describe("reports accounting periods", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the saved month start day for the 本期 preset and API request", async () => {
    window.localStorage.setItem(`baln:month-start-day:${userId}`, "26");
    const bounds = monthPeriodBounds(currentPeriodMonth(26), 26);
    const reportUrls: string[] = [];
    installReportHandlers(reportUrls);

    renderPage();

    expect(
      await screen.findByRole("combobox", { name: "報表期間：本期" }),
    ).toBeVisible();
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

  it("reveals and applies exact dates only for the custom preset", async () => {
    const user = userEvent.setup();
    const reportUrls: string[] = [];
    installReportHandlers(reportUrls);
    renderPage();

    await user.click(
      await screen.findByRole("combobox", { name: "報表期間：本期" }),
    );
    await user.click(screen.getByRole("option", { name: "自訂" }));

    const dateFrom = screen.getByLabelText("開始日期");
    const dateTo = screen.getByLabelText("結束日期");
    fireEvent.change(dateFrom, { target: { value: "2026-01-10" } });
    fireEvent.change(dateTo, { target: { value: "2026-01-20" } });
    await user.click(screen.getByRole("button", { name: "套用" }));

    await waitFor(() => {
      expect(
        reportUrls.some((url) => {
          const params = new URL(url).searchParams;
          return (
            params.get("date_from") === "2026-01-10" &&
            params.get("date_to") === "2026-01-21"
          );
        }),
      ).toBe(true);
    });
  });
});
