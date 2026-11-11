export type NumericKeypadKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "00"
  | "backspace"
  | "clear";

/** Fifteen digits stay below `Number.MAX_SAFE_INTEGER`. */
export const NUMERIC_KEYPAD_MAX_DIGITS = 15;

/** The digit string a keypad starts from for a stored whole number. */
export function keypadDigits(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? String(value) : "";
}

/** The whole number a keypad digit string stands for; empty means 0. */
export function keypadValue(digits: string) {
  return digits === "" ? 0 : Number(digits);
}

/**
 * Applies one keypad press to a digit string. Leading zeros are dropped, so
 * the result is always "" or a positive whole number without padding.
 */
export function applyKeypadKey(
  digits: string,
  key: NumericKeypadKey,
  maxDigits = NUMERIC_KEYPAD_MAX_DIGITS,
) {
  if (key === "clear") return "";
  if (key === "backspace") return digits.slice(0, -1);
  const next = (digits + key).replace(/^0+/, "");
  return next.length > maxDigits ? digits : next;
}
