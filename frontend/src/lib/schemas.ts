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
  type: accountTypeSchema,
  archived: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Account = z.infer<typeof accountSchema>;

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

export type CreateAccountRequest = {
  key: string;
  name: string;
  type: AccountType;
};

export type UpdateAccountRequest = {
  name?: string;
  archived?: boolean;
};

export type EntryWriteRequest = {
  date: string;
  description: string;
  note: string | null;
  postings: PostingInput[];
};

export type CreateEntryRequest = EntryWriteRequest & {
  dedup_key: string | null;
};
