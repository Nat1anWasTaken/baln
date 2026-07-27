import { describe, expect, it } from "vitest";

import {
  comparisonBoundsForMonth,
  comparisonBoundsForPreset,
  currentPeriodMonth,
  effectiveBounds,
  formatMoney,
  monthBounds,
  monthPeriodBounds,
  reportPresetBounds,
  toExclusiveDate,
  toInclusiveDate,
  trendGranularity,
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

  it("uses the saved start day for report period presets", () => {
    expect(reportPresetBounds("current", 26, "2026-07-27")).toEqual({
      dateFrom: "2026-07-26",
      dateTo: "2026-08-26",
    });
    expect(reportPresetBounds("previous", 26, "2026-07-27")).toEqual({
      dateFrom: "2026-06-26",
      dateTo: "2026-07-26",
    });
    expect(reportPresetBounds("last-3", 26, "2026-07-27")).toEqual({
      dateFrom: "2026-05-26",
      dateTo: "2026-08-26",
    });
    expect(reportPresetBounds("last-6", 31, "2026-03-15")).toEqual({
      dateFrom: "2025-09-30",
      dateTo: "2026-03-31",
    });
  });

  it("compares open periods by same progress or the full previous period", () => {
    expect(
      comparisonBoundsForMonth("2026-07", 26, "same-progress", "2026-07-27"),
    ).toEqual({
      dateFrom: "2026-06-26",
      dateTo: "2026-06-28",
    });
    expect(
      comparisonBoundsForMonth("2026-07", 26, "full-previous", "2026-07-27"),
    ).toEqual({
      dateFrom: "2026-06-26",
      dateTo: "2026-07-26",
    });
  });

  it("compares custom ranges with the preceding equal-duration range", () => {
    expect(
      comparisonBoundsForPreset(
        "custom",
        { dateFrom: "2026-07-10", dateTo: "2026-07-20" },
        26,
        "full-previous",
        "2026-07-27",
      ),
    ).toEqual({
      dateFrom: "2026-06-30",
      dateTo: "2026-07-10",
    });
  });

  it("caps open ranges and chooses a readable trend granularity", () => {
    expect(
      effectiveBounds(
        { dateFrom: "2026-07-26", dateTo: "2026-08-26" },
        "2026-07-27",
      ),
    ).toEqual({
      dateFrom: "2026-07-26",
      dateTo: "2026-07-28",
    });
    expect(
      trendGranularity({
        dateFrom: "2026-01-01",
        dateTo: "2026-02-15",
      }),
    ).toBe("day");
    expect(
      trendGranularity({
        dateFrom: "2026-01-01",
        dateTo: "2026-02-16",
      }),
    ).toBe("week");
    expect(
      trendGranularity({
        dateFrom: "2026-01-01",
        dateTo: "2026-07-01",
      }),
    ).toBe("month");
  });
});
