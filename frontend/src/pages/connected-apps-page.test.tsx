import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { API_BASE_URL } from "@/lib/api-client";
import { ConnectedAppsPage } from "@/pages/connected-apps-page";
import { server } from "@/test/server";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ConnectedAppsPage />
    </QueryClientProvider>,
  );
}

describe("connected apps page", () => {
  it("copies the MCP URL", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API_BASE_URL}/oauth/connected-apps`, () =>
        HttpResponse.json([]),
      ),
    );

    renderPage();
    await user.click(
      await screen.findByRole("button", { name: "複製 MCP URL" }),
    );

    expect(await navigator.clipboard.readText()).toBe(
      "http://localhost:8080/mcp",
    );
  });
});
