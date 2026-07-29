import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  invalidateAfterAccountWrite,
  invalidateAfterEntryWrite,
} from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";

function queryClientWithLedgerData() {
  const client = new QueryClient();
  client.setQueryData(queryKeys.accounts.list(false, ""), []);
  client.setQueryData(queryKeys.accounts.balance("account-id", "2026-07-29"), {
    display_balance_minor: 0,
  });
  client.setQueryData(queryKeys.entries.recent, { items: [] });
  client.setQueryData(queryKeys.entries.detail("entry-id"), {});
  client.setQueryData(
    queryKeys.reports.summary("2026-07-01", "2026-08-01"),
    {},
  );
  client.setQueryData(queryKeys.reports.position("2026-07-29"), {});
  client.setQueryData(queryKeys.apiTokens.all, []);
  return client;
}

function isInvalidated(client: QueryClient, queryKey: readonly unknown[]) {
  return client.getQueryState(queryKey)?.isInvalidated;
}

describe("ledger query invalidation", () => {
  it("invalidates every entry-derived view after an entry write", async () => {
    const client = queryClientWithLedgerData();

    await invalidateAfterEntryWrite(client);

    expect(isInvalidated(client, queryKeys.entries.recent)).toBe(true);
    expect(isInvalidated(client, queryKeys.entries.detail("entry-id"))).toBe(
      true,
    );
    expect(
      isInvalidated(
        client,
        queryKeys.reports.summary("2026-07-01", "2026-08-01"),
      ),
    ).toBe(true);
    expect(
      isInvalidated(client, queryKeys.reports.position("2026-07-29")),
    ).toBe(true);
    expect(
      isInvalidated(
        client,
        queryKeys.accounts.balance("account-id", "2026-07-29"),
      ),
    ).toBe(true);
    expect(isInvalidated(client, queryKeys.accounts.list(false, ""))).toBe(
      false,
    );
    expect(isInvalidated(client, queryKeys.apiTokens.all)).toBe(false);
  });

  it("invalidates account data and embedded account views after an account write", async () => {
    const client = queryClientWithLedgerData();

    await invalidateAfterAccountWrite(client);

    expect(isInvalidated(client, queryKeys.accounts.list(false, ""))).toBe(
      true,
    );
    expect(
      isInvalidated(
        client,
        queryKeys.accounts.balance("account-id", "2026-07-29"),
      ),
    ).toBe(true);
    expect(isInvalidated(client, queryKeys.entries.recent)).toBe(true);
    expect(isInvalidated(client, queryKeys.entries.detail("entry-id"))).toBe(
      true,
    );
    expect(
      isInvalidated(
        client,
        queryKeys.reports.summary("2026-07-01", "2026-08-01"),
      ),
    ).toBe(true);
    expect(isInvalidated(client, queryKeys.apiTokens.all)).toBe(false);
  });
});
