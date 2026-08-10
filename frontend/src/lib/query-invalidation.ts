import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

export function invalidateAfterEntryWrite(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.entries.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.reports.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts.balances }),
    queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all }),
  ]);
}

export function invalidateAfterAccountWrite(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.entries.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.reports.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all }),
  ]);
}

export function invalidateAfterBudgetWrite(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all });
}
