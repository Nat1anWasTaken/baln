import { z } from "zod";

export const accountTypeSchema = z.enum([
  "asset",
  "liability",
  "income",
  "expense",
  "equity",
]);

export type AccountType = z.infer<typeof accountTypeSchema>;

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  display_name: z.string(),
  active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type User = z.infer<typeof userSchema>;

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const apiTokenStatusSchema = z.enum(["active", "expired"]);

export const apiTokenSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  token_hint: z.string(),
  expires_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
  created_at: z.string(),
  status: apiTokenStatusSchema,
});

export type ApiToken = z.infer<typeof apiTokenSchema>;

export const createdApiTokenSchema = apiTokenSchema.extend({
  token: z.string().startsWith("baln_pat_"),
});

export type CreatedApiToken = z.infer<typeof createdApiTokenSchema>;

export type CreateApiTokenRequest = {
  name: string;
  expires_at: string | null;
};

export const oauthConsentSchema = z.object({
  request_id: z.string().uuid(),
  client_name: z.string(),
  scopes: z.array(z.string()),
  expires_at: z.string(),
});

export type OAuthConsent = z.infer<typeof oauthConsentSchema>;

export const oauthConsentDecisionSchema = z.object({
  status: z.enum(["approved", "denied"]),
  redirect_url: z.string().url(),
});

export const connectedAppSchema = z.object({
  id: z.string().uuid(),
  client_name: z.string(),
  scopes: z.array(z.string()),
  created_at: z.string(),
});

export type ConnectedApp = z.infer<typeof connectedAppSchema>;

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string(),
  fields: z.unknown().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const accountSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  note: z.string().nullable(),
  type: accountTypeSchema,
  archived: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Account = z.infer<typeof accountSchema>;

export const budgetPeriodUnitSchema = z.enum(["day", "week", "month", "year"]);
export type BudgetPeriodUnit = z.infer<typeof budgetPeriodUnitSchema>;
export const budgetRolloverModeSchema = z
  .enum(["accumulate", "surplus_only", "reset"])
  .default("accumulate");
export type BudgetRolloverMode = z.infer<typeof budgetRolloverModeSchema>;
export type RolloverEditMode = "recalculate" | "preserve";

export const budgetAccountSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  type: accountTypeSchema,
  archived: z.boolean(),
});

export const budgetStatusSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  amount_minor: z.number().int(),
  start_date: z.string(),
  period_count: z.number().int().positive(),
  period_unit: budgetPeriodUnitSchema,
  rollover_mode: budgetRolloverModeSchema,
  accounts: z.array(budgetAccountSchema).min(1),
  show_on_overview: z.boolean(),
  overview_position: z.number().int().nullable(),
  as_of: z.string(),
  period_from: z.string(),
  period_to: z.string(),
  carry_in_minor: z.number().int(),
  available_minor: z.number().int(),
  spent_minor: z.number().int(),
  remaining_minor: z.number().int(),
  status: z.enum(["upcoming", "active", "overspent"]),
  created_at: z.string(),
  updated_at: z.string(),
});

export type BudgetStatus = z.infer<typeof budgetStatusSchema>;

export const budgetPaceSchema = z.object({
  total_days: z.number().int().nonnegative(),
  elapsed_days: z.number().int().nonnegative(),
  remaining_days: z.number().int().nonnegative(),
  spent_through_as_of_minor: z.number().int(),
  future_spent_minor: z.number().int(),
  average_daily_spend_minor: z.number().nullable(),
  spendable_per_day_minor: z.number().nullable(),
});

export type BudgetPace = z.infer<typeof budgetPaceSchema>;

export const budgetTrendPointSchema = z.object({
  date_from: z.string(),
  date_to: z.string(),
  spent_minor: z.number().int(),
  remaining_minor: z.number().int(),
});

export type BudgetTrendPoint = z.infer<typeof budgetTrendPointSchema>;

export const budgetTrendSchema = z.object({
  bucket_days: z.number().int().positive(),
  points: z.array(budgetTrendPointSchema),
});

export type BudgetTrend = z.infer<typeof budgetTrendSchema>;

export const budgetDetailSchema = z.object({
  budget: budgetStatusSchema,
  period_offset: z.number().int(),
  period_kind: z.enum(["upcoming", "current", "past"]),
  has_previous: z.boolean(),
  has_next: z.boolean(),
  pace: budgetPaceSchema,
  trend: budgetTrendSchema,
});

export type BudgetDetail = z.infer<typeof budgetDetailSchema>;

export const budgetDaySchema = z.object({
  date: z.string(),
  spent_minor: z.number().int(),
  remaining_minor: z.number().int(),
  entry_count: z.number().int().nonnegative(),
  is_future: z.boolean(),
});

export type BudgetDay = z.infer<typeof budgetDaySchema>;

export const budgetDayPageSchema = z.object({
  items: z.array(budgetDaySchema),
  next_cursor: z.string().nullable(),
});

export type BudgetDayPage = z.infer<typeof budgetDayPageSchema>;

export const budgetPeriodOptionSchema = z.object({
  period_offset: z.number().int().nonpositive(),
  period_from: z.string(),
  period_to: z.string(),
  period_kind: z.enum(["upcoming", "current", "past"]),
});

export type BudgetPeriodOption = z.infer<typeof budgetPeriodOptionSchema>;

export const budgetPeriodsPageSchema = z.object({
  items: z.array(budgetPeriodOptionSchema),
  next_cursor: z.string().nullable(),
});

export const budgetStatisticsPointSchema = z.object({
  progress_bps: z.number().int().min(0).max(10_000),
  date: z.string(),
  actual_spent_minor: z.number().int(),
  scheduled_spent_minor: z.number().int(),
});

export const budgetStatisticsPeriodSchema = budgetPeriodOptionSchema.extend({
  total_days: z.number().int().positive(),
  elapsed_days: z.number().int().nonnegative(),
  carry_in_minor: z.number().int(),
  available_minor: z.number().int(),
  actual_spent_minor: z.number().int(),
  scheduled_spent_minor: z.number().int(),
  remaining_minor: z.number().int(),
  utilization_bps: z.number().int().nullable(),
  points: z.array(budgetStatisticsPointSchema),
});

export type BudgetStatisticsPeriod = z.infer<
  typeof budgetStatisticsPeriodSchema
>;

export const budgetStatisticsSchema = z.object({
  from_offset: z.number().int().nonpositive(),
  to_offset: z.number().int().nonpositive(),
  period_count: z.number().int().positive().max(24),
  includes_current: z.boolean(),
  summary: z.object({
    total_actual_spent_minor: z.number().int(),
    total_scheduled_spent_minor: z.number().int(),
    average_daily_spend_minor: z.number().int().nullable(),
    average_utilization_bps: z.number().int().nullable(),
    utilization_spread_bps: z.number().int().nullable(),
    overspent_periods: z.number().int().nonnegative(),
  }),
  periods: z.array(budgetStatisticsPeriodSchema),
});

export type BudgetStatistics = z.infer<typeof budgetStatisticsSchema>;

export type CreateBudgetRequest = {
  name: string;
  amount_minor: number;
  start_date: string;
  period_count: number;
  period_unit: BudgetPeriodUnit;
  rollover_mode: BudgetRolloverMode;
  account_keys: string[];
  show_on_overview: boolean;
};

export type UpdateBudgetRequest = Partial<CreateBudgetRequest> & {
  rollover_edit_mode?: RolloverEditMode;
};

export const accountBalanceSchema = z.object({
  account_id: z.string().uuid(),
  account_key: z.string(),
  as_of: z.string().nullable(),
  ledger_balance_minor: z.number().int(),
  display_balance_minor: z.number().int(),
});

export type AccountBalance = z.infer<typeof accountBalanceSchema>;

export const postingInputSchema = z.object({
  account_key: z.string().min(1),
  amount_minor: z
    .number()
    .int()
    .refine((amount) => amount !== 0),
  memo: z.string().nullable(),
});

export type PostingInput = z.infer<typeof postingInputSchema>;

export const accountSummarySchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  type: accountTypeSchema,
});

export const postingResponseSchema = z.object({
  id: z.string().uuid(),
  account: accountSummarySchema,
  amount_minor: z.number().int(),
  memo: z.string().nullable(),
  created_at: z.string(),
});

export type PostingResponse = z.infer<typeof postingResponseSchema>;

export const entryResponseSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  description: z.string(),
  note: z.string().nullable(),
  dedup_key: z.string().nullable(),
  postings: z.array(postingResponseSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export type EntryResponse = z.infer<typeof entryResponseSchema>;

export const possibleDuplicateMatchSchema = z.object({
  pending_entry_number: z.number().int().positive(),
  existing_entries: z.array(entryResponseSchema),
  pending_entry_numbers: z.array(z.number().int().positive()),
});

export const possibleDuplicateFieldsSchema = z.object({
  matches: z.array(possibleDuplicateMatchSchema).min(1),
});

export type PossibleDuplicateFields = z.infer<
  typeof possibleDuplicateFieldsSchema
>;

export const entryPageSchema = z.object({
  items: z.array(entryResponseSchema),
  next_cursor: z.string().nullable(),
});

export type EntryPage = z.infer<typeof entryPageSchema>;

export const reportAccountTotalSchema = z.object({
  account_id: z.string().uuid(),
  account_key: z.string(),
  account_name: z.string(),
  account_type: accountTypeSchema,
  total_minor: z.number().int(),
});

export const periodSummarySchema = z.object({
  date_from: z.string(),
  date_to: z.string(),
  income_minor: z.number().int(),
  expense_minor: z.number().int(),
  net_minor: z.number().int(),
  income_accounts: z.array(reportAccountTotalSchema),
  expense_accounts: z.array(reportAccountTotalSchema),
});

export type PeriodSummary = z.infer<typeof periodSummarySchema>;

export const reportGranularitySchema = z.enum(["day", "week", "month"]);

export const reportTrendPointSchema = z.object({
  date_from: z.string(),
  date_to: z.string(),
  income_minor: z.number().int(),
  expense_minor: z.number().int(),
  net_minor: z.number().int(),
});

export const reportTrendSchema = z.object({
  date_from: z.string(),
  date_to: z.string(),
  granularity: reportGranularitySchema,
  points: z.array(reportTrendPointSchema),
});

export type ReportTrend = z.infer<typeof reportTrendSchema>;

export const financialPositionSchema = z.object({
  as_of: z.string(),
  asset_minor: z.number().int(),
  liability_minor: z.number().int(),
  net_worth_minor: z.number().int(),
});

export type FinancialPosition = z.infer<typeof financialPositionSchema>;

export type CreateAccountRequest = {
  key: string;
  name: string;
  note?: string | null;
  type: AccountType;
};

export type UpdateAccountRequest = {
  key?: string;
  name?: string;
  note?: string | null;
  type?: AccountType;
  archived?: boolean;
  expected_updated_at?: string;
};

export type EntryWriteRequest = {
  date: string;
  description: string;
  note: string | null;
  postings: PostingInput[];
};

export type CreateEntryRequest = EntryWriteRequest & {
  dedup_key: string | null;
  confirmed_distinct?: boolean;
};
