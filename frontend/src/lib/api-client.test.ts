import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import {
  accountsApi,
  API_BASE_URL,
  ApiError,
  apiTokensApi,
  budgetsApi,
  entriesApi,
  reportsApi,
  setAccessToken,
} from "@/lib/api-client";
import { server } from "@/test/server";

afterEach(() => setAccessToken(null));

const budgetId = "01980000-0000-7000-8000-000000000050";
const budgetStatus = {
  id: budgetId,
  name: "日常開銷",
  amount_minor: 10_000,
  start_date: "2026-07-01",
  period_count: 1,
  period_unit: "month" as const,
  accounts: [
    {
      id: "01980000-0000-7000-8000-000000000001",
      key: "asset.cash",
      name: "現金",
      type: "asset" as const,
      archived: false,
    },
  ],
  show_on_overview: true,
  overview_position: 0,
  as_of: "2026-07-24",
  period_from: "2026-07-01",
  period_to: "2026-08-01",
  carry_in_minor: 2_000,
  available_minor: 12_000,
  spent_minor: 7_000,
  remaining_minor: 5_000,
  status: "active" as const,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

describe("API client", () => {
  it("loads budget details and day pages with a period offset", async () => {
    server.use(
      http.get(`${API_BASE_URL}/budgets/${budgetId}/details`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("period_offset")).toBe(
          "-1",
        );
        return HttpResponse.json({
          budget: budgetStatus,
          period_offset: -1,
          period_kind: "past",
          has_previous: true,
          has_next: true,
          pace: {
            total_days: 31,
            elapsed_days: 31,
            remaining_days: 0,
            spent_through_as_of_minor: 7_000,
            future_spent_minor: 0,
            average_daily_spend_minor: 225.8,
            spendable_per_day_minor: null,
          },
          trend: {
            bucket_days: 1,
            points: [
              {
                date_from: "2026-07-01",
                date_to: "2026-07-02",
                spent_minor: 200,
                remaining_minor: 11_800,
              },
            ],
          },
        });
      }),
      http.get(`${API_BASE_URL}/budgets/${budgetId}/days`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        expect(params.get("period_offset")).toBe("-1");
        expect(params.get("cursor")).toBe("2026-07-01");
        expect(params.get("limit")).toBe("25");
        return HttpResponse.json({
          items: [
            {
              date: "2026-07-01",
              spent_minor: 200,
              remaining_minor: 11_800,
              entry_count: 1,
              is_future: false,
            },
          ],
          next_cursor: null,
        });
      }),
    );

    const details = await budgetsApi.details(budgetId, -1);
    expect(details.period_kind).toBe("past");
    expect(details.trend.points[0]?.spent_minor).toBe(200);

    const days = await budgetsApi.days(budgetId, {
      periodOffset: -1,
      cursor: "2026-07-01",
      limit: 25,
    });
    expect(days.items[0]?.remaining_minor).toBe(11_800);
  });

  it("maps a budget filter to the entries API", async () => {
    server.use(
      http.get(`${API_BASE_URL}/entries`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("budget_id")).toBe(
          budgetId,
        );
        return HttpResponse.json({ items: [], next_cursor: null });
      }),
    );

    await expect(entriesApi.list({ budgetId })).resolves.toEqual({
      items: [],
      next_cursor: null,
    });
  });

  it("loads searchable budget periods and a bounded statistics range", async () => {
    server.use(
      http.get(`${API_BASE_URL}/budgets/${budgetId}/periods`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        expect(params.get("date")).toBe("2026-07-15");
        return HttpResponse.json({
          items: [
            {
              period_offset: -1,
              period_from: "2026-07-01",
              period_to: "2026-08-01",
              period_kind: "past",
            },
          ],
          next_cursor: null,
        });
      }),
      http.get(
        `${API_BASE_URL}/budgets/${budgetId}/statistics`,
        ({ request }) => {
          const params = new URL(request.url).searchParams;
          expect(params.get("from_offset")).toBe("-1");
          expect(params.get("to_offset")).toBe("0");
          return HttpResponse.json({
            from_offset: -1,
            to_offset: 0,
            period_count: 2,
            includes_current: true,
            summary: {
              total_actual_spent_minor: 7_000,
              total_scheduled_spent_minor: 500,
              average_daily_spend_minor: 170,
              average_utilization_bps: 4_200,
              utilization_spread_bps: 1_000,
              overspent_periods: 0,
            },
            periods: [],
          });
        },
      ),
    );

    const periods = await budgetsApi.periods(budgetId, {
      date: "2026-07-15",
    });
    expect(periods.items[0]?.period_offset).toBe(-1);
    const statistics = await budgetsApi.statistics(budgetId, -1, 0);
    expect(statistics.summary.total_scheduled_spent_minor).toBe(500);
  });

  it("parses report responses and includes cookie credentials", async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/monthly`, ({ request }) => {
        expect(request.credentials).toBe("include");
        expect(new URL(request.url).searchParams.get("month")).toBe("2026-07");
        return HttpResponse.json({
          date_from: "2026-07-01",
          date_to: "2026-08-01",
          income_minor: 50_000,
          expense_minor: 500,
          net_minor: 49_500,
          income_accounts: [],
          expense_accounts: [],
        });
      }),
    );

    const report = await reportsApi.monthly("2026-07");
    expect(report.net_minor).toBe(49_500);
  });

  it("coalesces concurrent token refreshes and retries protected reads", async () => {
    let refreshCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/accounts`, ({ request }) => {
        if (request.headers.get("authorization") === "Bearer refreshed") {
          return HttpResponse.json([]);
        }
        return HttpResponse.json(
          {
            type: "https://baln.local/problems/unauthorized",
            title: "Unauthorized",
            status: 401,
            code: "unauthorized",
            detail: "expired",
          },
          { status: 401 },
        );
      }),
      http.post(`${API_BASE_URL}/auth/refresh`, async () => {
        refreshCount += 1;
        await delay(20);
        return HttpResponse.json({
          access_token: "refreshed",
          token_type: "Bearer",
          expires_in: 900,
        });
      }),
    );

    await Promise.all([accountsApi.list(), accountsApi.list()]);
    expect(refreshCount).toBe(1);
  });

  it("normalizes problem details into localized API errors", async () => {
    server.use(
      http.get(`${API_BASE_URL}/reports/monthly`, () =>
        HttpResponse.json(
          {
            type: "https://baln.local/problems/invalid_month",
            title: "Bad Request",
            status: 400,
            code: "invalid_month",
            detail: "month must use YYYY-MM format",
          },
          { status: 400 },
        ),
      ),
    );

    await expect(reportsApi.monthly("bad")).rejects.toBeInstanceOf(ApiError);
  });

  it("deletes accounts and localizes referenced-account failures", async () => {
    const accountId = "01984dc2-132d-7ed2-b9d7-62e563f1ad89";
    let attempts = 0;
    server.use(
      http.delete(`${API_BASE_URL}/accounts/${accountId}`, () => {
        attempts += 1;
        if (attempts === 1) {
          return new HttpResponse(null, { status: 204 });
        }
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

    await expect(accountsApi.delete(accountId)).resolves.toBeUndefined();
    await expect(accountsApi.delete(accountId)).rejects.toMatchObject({
      message: "這個帳戶已有交易紀錄，請改為封存。",
      status: 409,
    });
  });

  it("creates, lists, and revokes personal API tokens", async () => {
    const tokenId = "01984dc2-132d-7ed2-b9d7-62e563f1ad89";
    let revoked = false;
    server.use(
      http.post(`${API_BASE_URL}/auth/api-tokens`, async ({ request }) => {
        expect(await request.json()).toEqual({
          name: "Automation",
          expires_at: null,
        });
        return HttpResponse.json(
          {
            id: tokenId,
            name: "Automation",
            token_hint: "baln_pat_…abcd",
            token: "baln_pat_abcdefghijklmnopqrstuvwxyz1234567890ABCDE",
            expires_at: null,
            last_used_at: null,
            created_at: "2026-07-24T12:00:00Z",
            status: "active",
          },
          { status: 201 },
        );
      }),
      http.get(`${API_BASE_URL}/auth/api-tokens`, () =>
        HttpResponse.json([
          {
            id: tokenId,
            name: "Automation",
            token_hint: "baln_pat_…abcd",
            expires_at: null,
            last_used_at: null,
            created_at: "2026-07-24T12:00:00Z",
            status: "active",
          },
        ]),
      ),
      http.delete(`${API_BASE_URL}/auth/api-tokens/${tokenId}`, () => {
        revoked = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const created = await apiTokensApi.create({
      name: "Automation",
      expires_at: null,
    });
    expect(created.token).toMatch(/^baln_pat_/);
    expect(await apiTokensApi.list()).toHaveLength(1);
    await apiTokensApi.revoke(tokenId);
    expect(revoked).toBe(true);
  });

  it("refreshes an expired browser session before retrying token management", async () => {
    let refreshCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/auth/api-tokens`, ({ request }) => {
        if (request.headers.get("authorization") === "Bearer refreshed") {
          return HttpResponse.json([]);
        }
        return HttpResponse.json(
          {
            type: "https://baln.local/problems/unauthorized",
            title: "Unauthorized",
            status: 401,
            code: "unauthorized",
            detail: "expired",
          },
          { status: 401 },
        );
      }),
      http.post(`${API_BASE_URL}/auth/refresh`, () => {
        refreshCount += 1;
        return HttpResponse.json({
          access_token: "refreshed",
          token_type: "Bearer",
          expires_in: 900,
        });
      }),
    );
    setAccessToken("expired");

    await expect(apiTokensApi.list()).resolves.toEqual([]);
    expect(refreshCount).toBe(1);
  });
});
