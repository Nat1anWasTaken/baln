export const queryKeys = {
  accounts: {
    all: ["accounts"] as const,
    list: (includeArchived: boolean, search: string) =>
      ["accounts", "list", includeArchived, search] as const,
    balances: ["accounts", "balance"] as const,
    balance: (accountId: string, asOf: string) =>
      ["accounts", "balance", accountId, asOf] as const,
  },
  budgets: {
    all: ["budgets"] as const,
    list: (overviewOnly: boolean) => ["budgets", "list", overviewOnly] as const,
    detail: (budgetId: string, offset = 0) =>
      ["budgets", "detail", budgetId, offset] as const,
    days: (budgetId: string, offset = 0) =>
      ["budgets", "days", budgetId, offset] as const,
    periods: (budgetId: string) => ["budgets", "periods", budgetId] as const,
    statistics: (
      budgetId: string,
      fromOffset: number | undefined,
      toOffset: number | undefined,
    ) => ["budgets", "statistics", budgetId, fromOffset, toOffset] as const,
  },
  entries: {
    all: ["entries"] as const,
    list: (
      dateFrom: string,
      dateTo: string,
      accountKey: string,
      budgetId: string,
      search: string,
    ) =>
      [
        "entries",
        "list",
        dateFrom,
        dateTo,
        accountKey,
        budgetId,
        search,
      ] as const,
    recent: ["entries", "recent"] as const,
    detail: (entryId: string) => ["entries", "detail", entryId] as const,
  },
  reports: {
    all: ["reports"] as const,
    summary: (dateFrom: string, dateTo: string) =>
      ["reports", "summary", dateFrom, dateTo] as const,
    trend: (dateFrom: string, dateTo: string, granularity: string) =>
      ["reports", "trend", dateFrom, dateTo, granularity] as const,
    position: (asOf: string) => ["reports", "position", asOf] as const,
  },
  apiTokens: {
    all: ["api-tokens"] as const,
  },
  connectedApps: {
    all: ["connected-apps"] as const,
  },
  oauthConsent: (requestId: string) => ["oauth-consent", requestId] as const,
} as const;
