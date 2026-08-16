import { z } from "zod";

import {
  accountBalanceSchema,
  accountSchema,
  budgetDayPageSchema,
  budgetDetailSchema,
  budgetPeriodsPageSchema,
  budgetStatisticsSchema,
  budgetStatusSchema,
  apiTokenSchema,
  createdApiTokenSchema,
  connectedAppSchema,
  entryPageSchema,
  entryResponseSchema,
  financialPositionSchema,
  periodSummarySchema,
  oauthConsentDecisionSchema,
  oauthConsentSchema,
  problemDetailsSchema,
  reportTrendSchema,
  tokenResponseSchema,
  userSchema,
  type CreateAccountRequest,
  type CreateBudgetRequest,
  type CreateApiTokenRequest,
  type CreateEntryRequest,
  type ProblemDetails,
  type UpdateAccountRequest,
  type UpdateBudgetRequest,
  type EntryWriteRequest,
} from "@/lib/schemas";
import {
  networkQueriesAreOnline,
  reportNetworkFailure,
} from "@/lib/connectivity";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1"
).replace(/\/$/, "");

let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;
let onSessionExpired: (() => void) | null = null;

const localizedProblems: Record<string, string> = {
  unauthorized: "登入狀態已失效，請重新登入。",
  forbidden: "你沒有執行這項操作的權限。",
  not_found: "找不到指定的資料。",
  invalid_account_name: "帳戶名稱不可為空白。",
  invalid_account_note: "帳戶備註不可超過 2,000 個字元。",
  invalid_account_key: "帳戶代碼格式不正確。",
  invalid_account_identity_update:
    "變更帳戶代碼或類型時，請重新載入帳戶後再試。",
  stale_account_update: "帳戶已被其他操作更新，請重新載入後再試。",
  account_in_use: "這個帳戶已有交易紀錄，請改為封存。",
  account_in_budget: "這個帳戶仍屬於預算，請先從預算中移除。",
  invalid_budget_name: "請輸入預算名稱。",
  invalid_budget_amount: "預算金額必須是正整數。",
  invalid_budget_period: "預算週期必須是正整數。",
  invalid_budget_accounts: "請至少選擇一個不重複的帳戶。",
  unknown_budget_account: "部分預算帳戶不存在或已封存。",
  rollover_edit_mode_required: "請選擇如何處理既有累計餘額。",
  invalid_budget_order: "預算排序已變更，請重新載入後再試。",
  invalid_period_offset: "無法顯示指定的預算週期。",
  invalid_statistics_range: "請選擇有效且連續的預算期別。",
  statistics_range_too_large: "跨期統計一次最多比較 24 期。",
  empty_update: "請至少修改一個欄位。",
  invalid_description: "交易說明不可為空白。",
  insufficient_postings: "一筆交易至少需要兩個分錄。",
  zero_posting: "分錄金額不可為零。",
  unbalanced_entry: "借方與貸方金額必須相等。",
  unknown_account: "部分帳戶不存在。",
  archived_account: "已封存的帳戶不能加入新交易。",
  invalid_date_range: "結束日期必須晚於開始日期。",
  trend_range_too_large: "所選期間太長，請縮短範圍或調整報表粒度。",
  invalid_cursor: "分頁資訊已失效，請重新載入。",
  possible_duplicate: "可能已有日期、帳戶與金額相同的交易。",
  invalid_api_token_name: "權杖名稱必須為 1 至 100 個字元。",
  invalid_api_token_expiry: "權杖到期時間必須晚於現在。",
  unique_constraint: "已有相同代碼的資料。",
  constraint_violation: "資料不符合帳務規則。",
  service_unavailable: "服務暫時無法使用，請稍後再試。",
  internal_error: "伺服器發生錯誤，請稍後再試。",
};

export class ApiError extends Error {
  status: number;
  problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(localizedProblems[problem.code] ?? problem.detail);
    this.name = "ApiError";
    this.status = problem.status;
    this.problem = problem;
  }
}

export class NetworkError extends Error {
  constructor(message = "目前無法連線，請檢查網路後再試。") {
    super(message);
    this.name = "NetworkError";
  }
}

export class OfflineWriteError extends Error {
  constructor() {
    super("離線模式僅供檢視，請連線後再進行變更。");
    this.name = "OfflineWriteError";
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

type RequestOptions<T> = {
  schema?: z.ZodType<T>;
  retryAuth?: boolean;
  allowWhileOffline?: boolean;
};

async function parseProblem(response: Response): Promise<ApiError> {
  const fallback: ProblemDetails = {
    type: "about:blank",
    title: response.statusText || "Error",
    status: response.status,
    code: response.status === 401 ? "unauthorized" : "request_failed",
    detail: response.statusText || "Request failed",
  };

  try {
    return new ApiError(problemDetailsSchema.parse(await response.json()));
  } catch {
    return new ApiError(fallback);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions<T> = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  if (
    method !== "GET" &&
    method !== "HEAD" &&
    !options.allowWhileOffline &&
    !networkQueriesAreOnline()
  ) {
    throw new OfflineWriteError();
  }

  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (accessToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    reportNetworkFailure();
    throw new NetworkError();
  }

  if (response.status === 401 && options.retryAuth !== false) {
    try {
      await refreshAccessToken();
      return request(path, init, { ...options, retryAuth: false });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAccessToken(null);
        onSessionExpired?.();
      }
      throw error;
    }
  }

  if (!response.ok) {
    throw await parseProblem(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data: unknown = await response.json();
  return options.schema ? options.schema.parse(data) : (data as T);
}

export async function refreshAccessToken(signal?: AbortSignal) {
  if (!refreshPromise) {
    refreshPromise = request(
      "/auth/refresh",
      { method: "POST", signal },
      {
        schema: tokenResponseSchema,
        retryAuth: false,
        allowWhileOffline: true,
      },
    )
      .then((token) => {
        setAccessToken(token.access_token);
        return token.access_token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function queryString(
  values: Record<string, string | number | boolean | null | undefined>,
) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  const value = params.toString();
  return value ? `?${value}` : "";
}

export const authApi = {
  async exchangeCode(code: string) {
    const token = await request(
      "/auth/token",
      {
        method: "POST",
        body: JSON.stringify({ code }),
      },
      { schema: tokenResponseSchema, retryAuth: false },
    );
    setAccessToken(token.access_token);
    return token;
  },
  me: (signal?: AbortSignal) =>
    request("/auth/me", { signal }, { schema: userSchema }),
  logout: () =>
    request<void>(
      "/auth/logout",
      { method: "POST" },
      { retryAuth: false, allowWhileOffline: true },
    ),
};

export const apiTokensApi = {
  list: () =>
    request("/auth/api-tokens", {}, { schema: z.array(apiTokenSchema) }),
  create: (body: CreateApiTokenRequest) =>
    request(
      "/auth/api-tokens",
      { method: "POST", body: JSON.stringify(body) },
      { schema: createdApiTokenSchema },
    ),
  revoke: (id: string) =>
    request<void>(`/auth/api-tokens/${id}`, { method: "DELETE" }),
};

export const oauthApi = {
  consentDetails: (requestId: string) =>
    request(`/oauth/consent/${requestId}`, {}, { schema: oauthConsentSchema }),
  decideConsent: (requestId: string, approve: boolean) =>
    request(
      `/oauth/consent/${requestId}`,
      { method: "POST", body: JSON.stringify({ approve }) },
      { schema: oauthConsentDecisionSchema },
    ),
  connectedApps: () =>
    request(
      "/oauth/connected-apps",
      {},
      { schema: z.array(connectedAppSchema) },
    ),
  revokeConnectedApp: (id: string) =>
    request<void>(`/oauth/connected-apps/${id}`, { method: "POST" }),
};

export const accountsApi = {
  list: (includeArchived = false, q?: string) =>
    request(
      `/accounts${queryString({ include_archived: includeArchived, q })}`,
      {},
      { schema: z.array(accountSchema) },
    ),
  get: (id: string) =>
    request(`/accounts/${id}`, {}, { schema: accountSchema }),
  create: (body: CreateAccountRequest) =>
    request(
      "/accounts",
      { method: "POST", body: JSON.stringify(body) },
      { schema: accountSchema },
    ),
  update: (id: string, body: UpdateAccountRequest) =>
    request(
      `/accounts/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
      { schema: accountSchema },
    ),
  delete: (id: string) =>
    request<void>(`/accounts/${id}`, { method: "DELETE" }),
  balance: (id: string, asOf?: string) =>
    request(
      `/accounts/${id}/balance${queryString({ as_of: asOf })}`,
      {},
      { schema: accountBalanceSchema },
    ),
};

export const budgetsApi = {
  list: (overviewOnly = false) =>
    request(
      `/budgets${queryString({ overview_only: overviewOnly })}`,
      {},
      { schema: z.array(budgetStatusSchema) },
    ),
  get: (id: string) =>
    request(`/budgets/${id}`, {}, { schema: budgetStatusSchema }),
  details: (id: string, periodOffset = 0) =>
    request(
      `/budgets/${id}/details${queryString({ period_offset: periodOffset })}`,
      {},
      { schema: budgetDetailSchema },
    ),
  days: (
    id: string,
    {
      periodOffset = 0,
      cursor,
      limit,
    }: {
      periodOffset?: number;
      cursor?: string;
      limit?: number;
    } = {},
  ) =>
    request(
      `/budgets/${id}/days${queryString({
        period_offset: periodOffset,
        cursor,
        limit,
      })}`,
      {},
      { schema: budgetDayPageSchema },
    ),
  periods: (
    id: string,
    {
      cursor,
      limit,
      date,
    }: { cursor?: string; limit?: number; date?: string } = {},
  ) =>
    request(
      `/budgets/${id}/periods${queryString({ cursor, limit, date })}`,
      {},
      { schema: budgetPeriodsPageSchema },
    ),
  statistics: (id: string, fromOffset?: number, toOffset?: number) =>
    request(
      `/budgets/${id}/statistics${queryString({
        from_offset: fromOffset,
        to_offset: toOffset,
      })}`,
      {},
      { schema: budgetStatisticsSchema },
    ),
  create: (body: CreateBudgetRequest) =>
    request(
      "/budgets",
      { method: "POST", body: JSON.stringify(body) },
      { schema: budgetStatusSchema },
    ),
  update: (id: string, body: UpdateBudgetRequest) =>
    request(
      `/budgets/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
      { schema: budgetStatusSchema },
    ),
  delete: (id: string) => request<void>(`/budgets/${id}`, { method: "DELETE" }),
  reorderOverview: (budgetIds: string[]) =>
    request<void>("/budgets/overview-order", {
      method: "PUT",
      body: JSON.stringify({ budget_ids: budgetIds }),
    }),
};

export type EntryListParams = {
  dateFrom?: string;
  dateTo?: string;
  accountKey?: string;
  budgetId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

export const entriesApi = {
  list: (params: EntryListParams = {}) =>
    request(
      `/entries${queryString({
        date_from: params.dateFrom,
        date_to: params.dateTo,
        account_key: params.accountKey,
        budget_id: params.budgetId,
        q: params.q,
        cursor: params.cursor,
        limit: params.limit,
      })}`,
      {},
      { schema: entryPageSchema },
    ),
  get: (id: string) =>
    request(`/entries/${id}`, {}, { schema: entryResponseSchema }),
  create: (body: CreateEntryRequest) =>
    request(
      "/entries",
      { method: "POST", body: JSON.stringify(body) },
      { schema: entryResponseSchema },
    ),
  update: (id: string, body: EntryWriteRequest) =>
    request(
      `/entries/${id}`,
      { method: "PUT", body: JSON.stringify(body) },
      { schema: entryResponseSchema },
    ),
  delete: (id: string) => request<void>(`/entries/${id}`, { method: "DELETE" }),
};

export const reportsApi = {
  monthly: (month: string) =>
    request(
      `/reports/monthly${queryString({ month })}`,
      {},
      { schema: periodSummarySchema },
    ),
  summary: (dateFrom: string, dateTo: string) =>
    request(
      `/reports/summary${queryString({
        date_from: dateFrom,
        date_to: dateTo,
      })}`,
      {},
      { schema: periodSummarySchema },
    ),
  trend: (
    dateFrom: string,
    dateTo: string,
    granularity: "day" | "week" | "month",
  ) =>
    request(
      `/reports/trend${queryString({
        date_from: dateFrom,
        date_to: dateTo,
        granularity,
      })}`,
      {},
      { schema: reportTrendSchema },
    ),
  position: (asOf: string) =>
    request(
      `/reports/position${queryString({ as_of: asOf })}`,
      {},
      { schema: financialPositionSchema },
    ),
};
