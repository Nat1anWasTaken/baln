import { describe, expect, it } from "vitest";

import {
  applyKeypadKey,
  keypadDigits,
  keypadValue,
  NUMERIC_KEYPAD_MAX_DIGITS,
} from "@/lib/numeric-keypad";

describe("numeric keypad", () => {
  it("appends digits and drops leading zeros", () => {
    expect(applyKeypadKey("", "0")).toBe("");
    expect(applyKeypadKey("", "00")).toBe("");
    expect(applyKeypadKey("", "7")).toBe("7");
    expect(applyKeypadKey("12", "00")).toBe("1200");
    expect(applyKeypadKey("12", "0")).toBe("120");
  });

  it("removes and clears digits", () => {
    expect(applyKeypadKey("120", "backspace")).toBe("12");
    expect(applyKeypadKey("", "backspace")).toBe("");
    expect(applyKeypadKey("120", "clear")).toBe("");
  });

  it("keeps values within the safe integer range", () => {
    const full = "9".repeat(NUMERIC_KEYPAD_MAX_DIGITS);
    expect(applyKeypadKey(full, "1")).toBe(full);
    expect(applyKeypadKey(full.slice(1), "00")).toBe(full.slice(1));
    expect(Number.isSafeInteger(keypadValue(full))).toBe(true);
    expect(applyKeypadKey("12", "3", 2)).toBe("12");
  });

  it("converts between stored numbers and digit strings", () => {
    expect(keypadDigits(0)).toBe("");
    expect(keypadDigits(Number.NaN)).toBe("");
    expect(keypadDigits(-5)).toBe("");
    expect(keypadDigits(1.5)).toBe("");
    expect(keypadDigits(1280)).toBe("1280");
    expect(keypadValue("")).toBe(0);
    expect(keypadValue("1280")).toBe(1280);
  });
});
