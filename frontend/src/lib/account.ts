import type { AccountType } from "@/lib/schemas";

export const accountTypeLabels: Record<AccountType, string> = {
  asset: "資產",
  liability: "負債",
  income: "收入",
  expense: "支出",
  equity: "權益",
};

export const accountTypes: AccountType[] = [
  "asset",
  "liability",
  "income",
  "expense",
  "equity",
];

export function accountKeyIsValid(key: string, type: AccountType) {
  const segment = "[a-z][a-z0-9_]*";
  return new RegExp(`^${type}\\.${segment}(\\.${segment})?$`).test(key);
}
