const DATE_WITH_SEPARATOR = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;
const COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/;

function partsToDate(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

export function formatDateValue(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function parseDateInput(value: string) {
  const normalized = value.trim();
  const match =
    DATE_WITH_SEPARATOR.exec(normalized) ?? COMPACT_DATE.exec(normalized);
  if (!match) return undefined;

  const date = partsToDate(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );
  return date ? formatDateValue(date) : undefined;
}

export function dateValueToDate(value: string) {
  const canonical = parseDateInput(value);
  if (!canonical) return undefined;
  const [year, month, day] = canonical.split("-").map(Number);
  return partsToDate(year, month, day);
}

export function formatDateForInput(value: string) {
  const canonical = parseDateInput(value);
  return canonical ? canonical.replaceAll("-", "/") : value;
}

export function formatDateForDisplay(value: string) {
  return value ? formatDateForInput(value) : "";
}

export function dateWithinBounds(value: string, min?: string, max?: string) {
  return (!min || value >= min) && (!max || value <= max);
}
