import { z } from "zod";

import {
  accountBalanceSchema,
  accountSchema,
  apiTokenSchema,
  createdApiTokenSchema,
  connectedAppSchema,
  entryPageSchema,
  entryResponseSchema,
  periodSummarySchema,
  oauthConsentDecisionSchema,
  oauthConsentSchema,
  problemDetailsSchema,
  tokenResponseSchema,
  userSchema,
  type CreateAccountRequest,
  type CreateApiTokenRequest,
  type CreateEntryRequest,
  type ProblemDetails,
  type UpdateAccountRequest,
  type EntryWriteRequest,
} from "@/lib/schemas";

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
  invalid_account_key: "帳戶代碼格式不正確。",
  empty_update: "請至少修改一個欄位。",
  invalid_description: "交易說明不可為空白。",
  insufficient_postings: "一筆交易至少需要兩個分錄。",
  zero_posting: "分錄金額不可為零。",
  unbalanced_entry: "借方與貸方金額必須相等。",
  unknown_account: "部分帳戶不存在。",
  archived_account: "已封存的帳戶不能加入新交易。",
  invalid_date_range: "結束日期必須晚於開始日期。",
  invalid_cursor: "分頁資訊已失效，請重新載入。",
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

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

type RequestOptions<T> = {
  schema?: z.ZodType<T>;
  retryAuth?: boolean;
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
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (accessToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && options.retryAuth !== false) {
    try {
      await refreshAccessToken();
      return request(path, init, { ...options, retryAuth: false });
    } catch {
      setAccessToken(null);
      onSessionExpired?.();
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

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = request(
      "/auth/refresh",
      { method: "POST" },
      { schema: tokenResponseSchema, retryAuth: false },
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
  me: () => request("/auth/me", {}, { schema: userSchema }),
  logout: () =>
    request<void>("/auth/logout", { method: "POST" }, { retryAuth: false }),
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
  balance: (id: string, asOf?: string) =>
    request(
      `/accounts/${id}/balance${queryString({ as_of: asOf })}`,
      {},
      { schema: accountBalanceSchema },
    ),
};

export type EntryListParams = {
  dateFrom?: string;
  dateTo?: string;
  accountKey?: string;
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
};
