import { describe, expect, it } from "vitest";

import {
  currentPeriodMonth,
  formatMoney,
  monthBounds,
  monthPeriodBounds,
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

  it("builds custom month periods and clamps missing days to month end", () => {
    expect(monthPeriodBounds("2026-07", 26)).toEqual({
      dateFrom: "2026-07-26",
      dateTo: "2026-08-26",
    });
    expect(monthPeriodBounds("2026-02", 31)).toEqual({
      dateFrom: "2026-02-28",
      dateTo: "2026-03-31",
    });
    expect(monthPeriodBounds("2028-02", 31)).toEqual({
      dateFrom: "2028-02-29",
      dateTo: "2028-03-31",
    });
  });

  it("finds the period containing today before and on its boundary", () => {
    expect(currentPeriodMonth(26, "2026-07-25")).toBe("2026-06");
    expect(currentPeriodMonth(26, "2026-07-26")).toBe("2026-07");
    expect(currentPeriodMonth(31, "2026-04-29")).toBe("2026-03");
    expect(currentPeriodMonth(31, "2026-04-30")).toBe("2026-04");
    expect(currentPeriodMonth(26, "2026-01-01")).toBe("2025-12");
  });
});
