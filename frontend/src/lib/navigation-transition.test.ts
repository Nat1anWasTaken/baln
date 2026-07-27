import { describe, expect, it } from "vitest";

import {
  getNavigationDirection,
  isEntryEditorPath,
} from "@/lib/navigation-transition";

describe("navigation transition direction", () => {
  it.each([
    ["/", "/entries", "forward"],
    ["/entries", "/accounts", "forward"],
    ["/accounts", "/reports", "forward"],
    ["/reports", "/accounts", "back"],
    ["/accounts", "/entries", "back"],
    ["/entries", "/", "back"],
    ["/", "/reports", "forward"],
    ["/reports", "/entries", "back"],
  ] as const)(
    "orders primary navigation from %s to %s as %s",
    (from, to, expected) => {
      expect(getNavigationDirection(from, to)).toBe(expected);
    },
  );

  it.each([
    ["/entries", "/entries/entry-1", "forward"],
    ["/entries/entry-1", "/entries", "back"],
    ["/entries/entry-1", "/entries/entry-1/edit", "forward"],
    ["/entries/entry-1/edit", "/entries/entry-1", "back"],
    ["/entries/new", "/entries/entry-1", "forward"],
  ] as const)(
    "orders the transaction hierarchy from %s to %s as %s",
    (from, to, expected) => {
      expect(getNavigationDirection(from, to)).toBe(expected);
    },
  );

  it("orders settings after primary pages and within settings", () => {
    expect(getNavigationDirection("/", "/settings/api-tokens")).toBe("forward");
    expect(
      getNavigationDirection(
        "/settings/api-tokens",
        "/settings/connected-apps",
      ),
    ).toBe("forward");
    expect(
      getNavigationDirection(
        "/settings/connected-apps",
        "/settings/api-tokens",
      ),
    ).toBe("back");
    expect(getNavigationDirection("/settings/api-tokens", "/reports")).toBe(
      "back",
    );
  });

  it("lets semantic intent override route structure", () => {
    expect(getNavigationDirection("/entries/new", "/entries", "forward")).toBe(
      "forward",
    );
    expect(getNavigationDirection("/", "/reports", "back")).toBe("back");
    expect(getNavigationDirection("/entries", "/entries/new", "overlay")).toBe(
      "none",
    );
    expect(getNavigationDirection("/entries", "/accounts", "none")).toBe(
      "none",
    );
  });

  it("does not animate same-page or authentication navigation", () => {
    expect(getNavigationDirection("/entries", "/entries")).toBe("none");
    expect(getNavigationDirection("/login", "/")).toBe("none");
    expect(getNavigationDirection("/auth/callback", "/reports")).toBe("none");
    expect(getNavigationDirection("/", "/oauth/consent")).toBe("none");
  });
});

describe("transaction editor route detection", () => {
  it.each([
    ["/entries/new", true],
    ["/entries/entry-1/edit", true],
    ["/entries", false],
    ["/entries/entry-1", false],
    ["/reports", false],
  ] as const)("detects %s as %s", (pathname, expected) => {
    expect(isEntryEditorPath(pathname)).toBe(expected);
  });
});
