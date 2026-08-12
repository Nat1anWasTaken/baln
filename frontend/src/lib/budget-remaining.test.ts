import { describe, expect, it } from "vitest";

import { budgetRemainingBreakdown } from "@/lib/budget-remaining";

const base = {
  amount_minor: 10_000,
  carry_in_minor: 2_000,
  remaining_minor: 5_000,
  rollover_mode: "accumulate" as const,
  spent_minor: 7_000,
};

describe("budgetRemainingBreakdown", () => {
  it("separates a positive accumulated rollover", () => {
    expect(budgetRemainingBreakdown(base)).toEqual({
      currentMinor: 3_000,
      adjustment: { kind: "rollover", amountMinor: 2_000 },
    });
  });

  it("shows an accumulated previous overspend as a deduction", () => {
    expect(
      budgetRemainingBreakdown({
        ...base,
        carry_in_minor: -2_000,
        remaining_minor: 1_000,
      }),
    ).toEqual({
      currentMinor: 3_000,
      adjustment: { kind: "deduction", amountMinor: 2_000 },
    });
  });

  it("omits rollover for reset mode", () => {
    expect(
      budgetRemainingBreakdown({
        ...base,
        rollover_mode: "reset",
        carry_in_minor: 0,
        remaining_minor: 3_000,
      }),
    ).toEqual({ currentMinor: 3_000, adjustment: null });
  });

  it("omits a fully spent surplus-only rollover", () => {
    expect(
      budgetRemainingBreakdown({
        ...base,
        rollover_mode: "surplus_only",
        spent_minor: 12_000,
        remaining_minor: 0,
      }),
    ).toEqual({ currentMinor: 0, adjustment: null });
  });
});
