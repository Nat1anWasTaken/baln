import { describe, expect, it } from "vitest";

import { accountKeyIsValid } from "@/lib/account";

describe("account key validation", () => {
  it("accepts two and three segment keys matching the account type", () => {
    expect(accountKeyIsValid("asset.cash", "asset")).toBe(true);
    expect(accountKeyIsValid("asset.bank.esun", "asset")).toBe(true);
  });

  it("rejects mismatched types and invalid segments", () => {
    expect(accountKeyIsValid("expense.food", "asset")).toBe(false);
    expect(accountKeyIsValid("asset.Bank", "asset")).toBe(false);
    expect(accountKeyIsValid("asset.too.many.parts", "asset")).toBe(false);
  });
});
