import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { BudgetCarousel } from "@/components/budget-carousel";
import { API_BASE_URL } from "@/lib/api-client";
import { server } from "@/test/server";

vi.mock("@/auth/auth-context", () => ({ useOfflineReadOnly: () => false }));

function renderCarousel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <BudgetCarousel />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("BudgetCarousel", () => {
  it("provides a touch-sized setup path when no overview budgets exist", async () => {
    server.use(
      http.get(`${API_BASE_URL}/budgets`, () => HttpResponse.json([])),
    );
    renderCarousel();
    expect(await screen.findByText("尚未選擇總覽預算")).toBeVisible();
    expect(screen.getByRole("link", { name: "管理預算" })).toHaveAttribute(
      "href",
      "/budgets",
    );
  });
});
