import { describe, expect, it } from "vitest";

import {
  formatMoney,
  monthBounds,
  toExclusiveDate,
  toInclusiveDate,
} from "@/lib/format";

describe("ledger formatting", () => {
  it("formats TWD explicitly without fractional digits", () => {
    const formatted = formatMoney(123_456);

    expect(formatted).toMatch(/^TWD\s123,456$/);
    expect(formatted).not.toContain(".00");
  });

  it("converts inclusive UI end dates to exclusive API dates", () => {
    expect(toExclusiveDate("2026-07-31")).toBe("2026-08-01");
    expect(toInclusiveDate("2026-08-01")).toBe("2026-07-31");
  });

  it("builds calendar month bounds", () => {
    expect(monthBounds("2026-12")).toEqual({
      dateFrom: "2026-12-01",
      dateTo: "2027-01-01",
    });
  });
});
