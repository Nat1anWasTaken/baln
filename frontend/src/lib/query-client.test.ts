import { describe, expect, it } from "vitest";

import { queryClient } from "@/lib/query-client";

describe("query freshness policy", () => {
  it("revalidates cached data whenever the user returns to the app or page", () => {
    const options = queryClient.getDefaultOptions().queries;

    expect(options?.refetchOnMount).toBe("always");
    expect(options?.refetchOnWindowFocus).toBe("always");
    expect(options?.refetchOnReconnect).toBe("always");
  });
});
