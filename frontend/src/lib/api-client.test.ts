import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import {
  accountsApi,
  API_BASE_URL,
  ApiError,
  reportsApi,
  setAccessToken,
} from "@/lib/api-client";
import { server } from "@/test/server";

afterEach(() => setAccessToken(null));

describe("API client", () => {
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
});
