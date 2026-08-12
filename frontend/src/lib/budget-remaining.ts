import type { BudgetStatus } from "@/lib/schemas";

type RemainingBudget = Pick<
  BudgetStatus,
  | "amount_minor"
  | "carry_in_minor"
  | "remaining_minor"
  | "rollover_mode"
  | "spent_minor"
>;

export type BudgetRemainingBreakdown = {
  currentMinor: number;
  adjustment:
    | { kind: "rollover"; amountMinor: number }
    | { kind: "deduction"; amountMinor: number }
    | null;
};

export function budgetRemainingBreakdown(
  budget: RemainingBudget,
): BudgetRemainingBreakdown {
  const remaining = Math.max(0, budget.remaining_minor);

  if (budget.rollover_mode === "reset") {
    return { currentMinor: remaining, adjustment: null };
  }

  const currentBeforeRollover = Math.max(
    0,
    budget.amount_minor - Math.max(budget.spent_minor, 0),
  );

  if (budget.rollover_mode === "accumulate" && budget.carry_in_minor < 0) {
    const deduction = Math.max(0, currentBeforeRollover - remaining);
    return {
      currentMinor: currentBeforeRollover,
      adjustment:
        deduction > 0 ? { kind: "deduction", amountMinor: deduction } : null,
    };
  }

  const currentMinor = Math.min(remaining, currentBeforeRollover);
  const rollover = Math.max(0, remaining - currentMinor);
  return {
    currentMinor,
    adjustment:
      rollover > 0 ? { kind: "rollover", amountMinor: rollover } : null,
  };
}
