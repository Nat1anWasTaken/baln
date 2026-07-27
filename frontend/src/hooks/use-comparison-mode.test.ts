import { beforeEach, describe, expect, it } from "vitest";

import {
  parseComparisonMode,
  readComparisonMode,
  writeComparisonMode,
} from "@/hooks/use-comparison-mode";

describe("comparison mode preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults invalid values to same progress", () => {
    expect(parseComparisonMode(null)).toBe("same-progress");
    expect(parseComparisonMode("unknown")).toBe("same-progress");
    expect(parseComparisonMode("full-previous")).toBe("full-previous");
  });

  it("stores preferences separately for each user", () => {
    expect(writeComparisonMode("user-a", "full-previous")).toBe(
      "full-previous",
    );
    expect(readComparisonMode("user-a")).toBe("full-previous");
    expect(readComparisonMode("user-b")).toBe("same-progress");
  });
});
