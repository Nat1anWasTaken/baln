import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL } from "@/lib/api-client";
import {
  currentPeriodMonth,
  monthPeriodBounds,
  toInclusiveDate,
} from "@/lib/format";
import { ReportsPage } from "@/pages/reports-page";
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
        <ReportsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("reports current period", () => {
  beforeEach(() => {
    window.localStorage.clear();
    server.use(
      http.get(`${API_BASE_URL}/reports/summary`, () =>
        HttpResponse.json({
          date_from: "2026-01-01",
          date_to: "2026-02-01",
          income_minor: 0,
          expense_minor: 0,
          net_minor: 0,
          income_accounts: [],
          expense_accounts: [],
        }),
      ),
    );
  });

  it("uses the saved start day for defaults and the current-period shortcut", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(`baln:month-start-day:${userId}`, "26");
    const bounds = monthPeriodBounds(currentPeriodMonth(26), 26);
    const inclusiveDateTo = toInclusiveDate(bounds.dateTo);

    renderPage();

    const dateFrom = screen.getByLabelText("開始日期");
    const dateTo = screen.getByLabelText("結束日期");
    expect(dateFrom).toHaveValue(bounds.dateFrom);
    expect(dateTo).toHaveValue(inclusiveDateTo);

    fireEvent.change(dateFrom, { target: { value: "2026-01-01" } });
    fireEvent.change(dateTo, { target: { value: "2026-01-31" } });
    await user.click(screen.getByRole("button", { name: "本期" }));

    expect(dateFrom).toHaveValue(bounds.dateFrom);
    expect(dateTo).toHaveValue(inclusiveDateTo);
  });
});
