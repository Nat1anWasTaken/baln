import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { API_BASE_URL } from "@/lib/api-client";
import { ApiTokensPage } from "@/pages/api-tokens-page";
import { server } from "@/test/server";

const tokenId = "01984dc2-132d-7ed2-b9d7-62e563f1ad89";

function token(overrides: Record<string, unknown> = {}) {
  return {
    id: tokenId,
    name: "Automation",
    token_hint: "baln_pat_…abcd",
    expires_at: null,
    last_used_at: null,
    created_at: "2026-07-24T12:00:00Z",
    status: "active",
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ApiTokensPage />
    </QueryClientProvider>,
  );
}

describe("API tokens page", () => {
  it("creates a token and displays its secret only in the result dialog", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API_BASE_URL}/auth/api-tokens`, () => HttpResponse.json([])),
      http.post(`${API_BASE_URL}/auth/api-tokens`, async ({ request }) => {
        const body = (await request.json()) as {
          name: string;
          expires_at: string | null;
        };
        expect(body.name).toBe("記帳自動化");
        expect(body.expires_at).toBeNull();
        return HttpResponse.json(
          {
            ...token({ name: body.name, expires_at: body.expires_at }),
            token: "baln_pat_abcdefghijklmnopqrstuvwxyz1234567890ABCDE",
          },
          { status: 201 },
        );
      }),
    );

    renderPage();
    await user.click(
      await screen.findByRole("button", { name: "建立第一個權杖" }),
    );
    const createDialog = screen.getByRole("dialog");
    await user.type(within(createDialog).getByLabelText("名稱"), "記帳自動化");
    await user.click(within(createDialog).getByLabelText("有效期限"));
    await user.click(screen.getByRole("option", { name: "永不到期" }));
    await user.click(
      within(createDialog).getByRole("button", { name: "建立權杖" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("這是唯一一次顯示完整權杖。關閉後將無法再次查看。"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("baln_pat_abcdefghijklmnopqrstuvwxyz1234567890ABCDE"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "複製權杖" }));
    expect(await navigator.clipboard.readText()).toBe(
      "baln_pat_abcdefghijklmnopqrstuvwxyz1234567890ABCDE",
    );
    await user.click(screen.getByRole("button", { name: "我已儲存" }));
    expect(
      screen.queryByText("baln_pat_abcdefghijklmnopqrstuvwxyz1234567890ABCDE"),
    ).not.toBeInTheDocument();
  });

  it("validates token names before sending a creation request", async () => {
    const user = userEvent.setup();
    let createRequests = 0;
    server.use(
      http.get(`${API_BASE_URL}/auth/api-tokens`, () => HttpResponse.json([])),
      http.post(`${API_BASE_URL}/auth/api-tokens`, () => {
        createRequests += 1;
        return HttpResponse.json({}, { status: 500 });
      }),
    );

    renderPage();
    await user.click(
      await screen.findByRole("button", { name: "建立第一個權杖" }),
    );
    const createDialog = screen.getByRole("dialog");
    await user.click(
      within(createDialog).getByRole("button", { name: "建立權杖" }),
    );

    expect(
      within(createDialog).getByText("請輸入權杖名稱。"),
    ).toBeInTheDocument();
    expect(createRequests).toBe(0);
  });

  it("submits the default 90-day expiration and preserves the dialog on failure", async () => {
    const user = userEvent.setup();
    let submittedExpiration: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/auth/api-tokens`, () => HttpResponse.json([])),
      http.post(`${API_BASE_URL}/auth/api-tokens`, async ({ request }) => {
        const body = (await request.json()) as { expires_at: string | null };
        submittedExpiration = body.expires_at;
        return HttpResponse.json(
          {
            type: "about:blank",
            title: "Bad request",
            status: 400,
            code: "invalid_api_token_expiry",
            detail: "invalid expiration",
          },
          { status: 400 },
        );
      }),
    );

    renderPage();
    await user.click(
      await screen.findByRole("button", { name: "建立第一個權杖" }),
    );
    const createDialog = screen.getByRole("dialog");
    await user.type(
      within(createDialog).getByLabelText("名稱"),
      "Default expiry",
    );
    await user.click(
      within(createDialog).getByRole("button", { name: "建立權杖" }),
    );

    await waitFor(() => expect(submittedExpiration).not.toBeNull());
    const daysUntilExpiration =
      (new Date(submittedExpiration!).getTime() - Date.now()) / 86_400_000;
    expect(daysUntilExpiration).toBeGreaterThan(89.9);
    expect(daysUntilExpiration).toBeLessThanOrEqual(90);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows token states and revokes only after confirmation", async () => {
    const user = userEvent.setup();
    let revokedId: string | null = null;
    let tokens = [
      token({
        last_used_at: "2026-07-24T13:00:00Z",
        expires_at: "2026-10-24T12:00:00Z",
      }),
      token({
        id: "01984dc2-132d-7ed2-b9d7-62e563f1ad90",
        name: "Old integration",
        token_hint: "baln_pat_…wxyz",
        status: "expired",
        expires_at: "2026-07-23T12:00:00Z",
      }),
    ];
    server.use(
      http.get(`${API_BASE_URL}/auth/api-tokens`, () =>
        HttpResponse.json(tokens),
      ),
      http.delete(`${API_BASE_URL}/auth/api-tokens/:id`, ({ params }) => {
        revokedId = String(params.id);
        tokens = tokens.filter((item) => item.id !== revokedId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPage();
    expect(await screen.findByText("Automation")).toBeInTheDocument();
    expect(screen.getByText("Old integration")).toBeInTheDocument();
    expect(screen.getByText("有效")).toBeInTheDocument();
    expect(screen.getByText("已到期")).toBeInTheDocument();
    expect(screen.getByText(/2026\/07\/24 21:00/)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "撤銷" })[0]);
    expect(screen.getByText("撤銷「Automation」？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "撤銷權杖" }));
    await waitFor(() => expect(revokedId).toBe(tokenId));
    await waitFor(() =>
      expect(screen.queryByText("Automation")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Old integration")).toBeInTheDocument();
  });

  it("renders list errors and retries the request", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    server.use(
      http.get(`${API_BASE_URL}/auth/api-tokens`, () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json(
            {
              type: "about:blank",
              title: "Service unavailable",
              status: 503,
              code: "service_unavailable",
              detail: "try again",
            },
            { status: 503 },
          );
        }
        return HttpResponse.json([token()]);
      }),
    );

    renderPage();
    expect(
      await screen.findByText("服務暫時無法使用，請稍後再試。"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新載入" }));
    expect(await screen.findByText("Automation")).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});
