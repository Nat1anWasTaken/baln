import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { API_BASE_URL } from "@/lib/api-client";
import { AccountsPage } from "@/pages/accounts-page";
import { server } from "@/test/server";

const accountId = "01980000-0000-7000-8000-000000000001";
const account = {
  id: accountId,
  key: "asset.cash",
  name: "現金",
  type: "asset",
  archived: false,
  created_at: "2026-07-24T00:00:00Z",
  updated_at: "2026-07-24T00:00:00Z",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AccountsPage />
    </QueryClientProvider>,
  );
}

function mockBalance() {
  server.use(
    http.get(`${API_BASE_URL}/accounts/:id/balance`, ({ params }) =>
      HttpResponse.json({
        account_id: params.id,
        account_key: "asset.cash",
        as_of: "2026-07-25",
        ledger_balance_minor: 0,
        display_balance_minor: 0,
      }),
    ),
  );
}

describe("accounts page deletion", () => {
  it("cancels or confirms permanent deletion", async () => {
    const user = userEvent.setup();
    let accounts = [account];
    let deletedId: string | null = null;
    mockBalance();
    server.use(
      http.get(`${API_BASE_URL}/accounts`, () => HttpResponse.json(accounts)),
      http.delete(`${API_BASE_URL}/accounts/:id`, ({ params }) => {
        deletedId = String(params.id);
        accounts = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPage();
    await screen.findAllByText("現金");

    await user.click(screen.getAllByRole("button", { name: "刪除 現金" })[0]);
    expect(screen.getByText("刪除「現金」？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(deletedId).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "刪除 現金" })[0]);
    await user.click(screen.getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(deletedId).toBe(accountId));
    await waitFor(() =>
      expect(screen.getByText("還沒有帳戶")).toBeInTheDocument(),
    );
  });

  it("keeps the confirmation open when a referenced account is rejected", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    mockBalance();
    server.use(
      http.get(`${API_BASE_URL}/accounts`, () => HttpResponse.json([account])),
      http.delete(`${API_BASE_URL}/accounts/:id`, () => {
        attempts += 1;
        return HttpResponse.json(
          {
            type: "https://baln.local/problems/account_in_use",
            title: "Conflict",
            status: 409,
            code: "account_in_use",
            detail: "archive this account instead",
          },
          { status: 409 },
        );
      }),
    );

    renderPage();
    await screen.findAllByText("現金");
    await user.click(screen.getAllByRole("button", { name: "刪除 現金" })[0]);
    await user.click(screen.getByRole("button", { name: "確認刪除" }));

    await waitFor(() => expect(attempts).toBe(1));
    expect(screen.getByText("刪除「現金」？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認刪除" })).toBeEnabled();
  });
});
