import { describe, expect, it } from "vitest";

import { routeModuleKeyForPath } from "@/lib/route-modules";

describe("route module preloading", () => {
  it.each([
    ["/", "dashboard"],
    ["/login", "login"],
    ["/auth/callback", "authCallback"],
    ["/accounts", "accounts"],
    ["/reports", "reports"],
    ["/settings/api-tokens", "apiTokens"],
    ["/settings/connected-apps", "connectedApps"],
    ["/oauth/consent", "oauthConsent"],
    ["/entries", "entries"],
    ["/entries/new", "entryEditor"],
    ["/entries/entry-1/edit", "entryEditor"],
    ["/entries/entry-1", "entryDetail"],
    ["/missing", "notFound"],
  ] as const)("maps %s to the %s route module", (pathname, expected) => {
    expect(routeModuleKeyForPath(pathname)).toBe(expected);
  });
});
