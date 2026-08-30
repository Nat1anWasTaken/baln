import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  OFFLINE_CACHE_BUSTER,
  OFFLINE_MAX_AGE,
  isPersistedQueryKey,
  shouldPersistQuery,
} from "@/lib/offline-storage";
import { queryKeys } from "@/lib/query-keys";

describe("offline query persistence policy", () => {
  it("persists successful financial reads and excludes security data", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.accounts.list(false, ""), []);
    client.setQueryData(queryKeys.apiTokens.all, []);

    const accounts = client
      .getQueryCache()
      .find({ queryKey: queryKeys.accounts.list(false, "") });
    const tokens = client
      .getQueryCache()
      .find({ queryKey: queryKeys.apiTokens.all });

    expect(accounts && shouldPersistQuery(accounts)).toBe(true);
    expect(tokens && shouldPersistQuery(tokens)).toBe(false);
    expect(isPersistedQueryKey(queryKeys.oauthConsent("request"))).toBe(false);
  });

  it("uses an explicit 24-hour lifetime and schema buster", () => {
    expect(OFFLINE_MAX_AGE).toBe(24 * 60 * 60 * 1000);
    expect(OFFLINE_CACHE_BUSTER).toBe("baln-offline-v3");
  });
});
