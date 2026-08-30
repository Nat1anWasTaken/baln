import { describe, expect, it } from "vitest";

import {
  dateValueToDate,
  formatDateForInput,
  formatDateValue,
  parseDateInput,
} from "@/lib/date-input";

describe("date input helpers", () => {
  it.each([
    ["2026/8/30", "2026-08-30"],
    ["2026-08-30", "2026-08-30"],
    ["20260830", "2026-08-30"],
    [" 2028/02/29 ", "2028-02-29"],
  ])("normalizes %s", (input, expected) => {
    expect(parseDateInput(input)).toBe(expected);
  });

  it.each(["2026/02/29", "2026/04/31", "26/08/30", "2026.08.30"])(
    "rejects invalid date %s",
    (input) => expect(parseDateInput(input)).toBeUndefined(),
  );

  it("round-trips date-only values without UTC serialization", () => {
    const date = dateValueToDate("2026-08-30");
    expect(date).toBeDefined();
    expect(formatDateValue(date!)).toBe("2026-08-30");
    expect(formatDateForInput("2026-08-30")).toBe("2026/08/30");
  });
});
