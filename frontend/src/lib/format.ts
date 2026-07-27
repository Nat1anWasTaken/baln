import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  getDaysInMonth,
  parseISO,
  setDate,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { zhTW } from "date-fns/locale";

export const APP_TIME_ZONE = "Asia/Taipei";

export type DateBounds = {
  dateFrom: string;
  dateTo: string;
};

export type ReportPreset =
  "current" | "previous" | "last-3" | "last-6" | "year" | "custom";

export type ComparisonMode = "same-progress" | "full-previous";

const currencyFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  currencyDisplay: "code",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 0,
});

export function formatMoney(amountMinor: number) {
  return currencyFormatter.format(amountMinor);
}

export function formatInteger(amount: number) {
  return numberFormatter.format(amount);
}

export function todayTaipei() {
  return formatInTimeZone(new Date(), APP_TIME_ZONE, "yyyy-MM-dd");
}

export function currentMonthTaipei() {
  return formatInTimeZone(new Date(), APP_TIME_ZONE, "yyyy-MM");
}

export function toExclusiveDate(inclusiveDate: string) {
  return format(addDays(parseISO(inclusiveDate), 1), "yyyy-MM-dd");
}

export function toInclusiveDate(exclusiveDate: string) {
  return format(addDays(parseISO(exclusiveDate), -1), "yyyy-MM-dd");
}

export function monthBounds(month: string) {
  const from = parseISO(`${month}-01`);
  const next = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  return {
    dateFrom: format(startOfMonth(from), "yyyy-MM-dd"),
    dateTo: format(next, "yyyy-MM-dd"),
  };
}

function monthBoundary(month: string, startDay: number) {
  const firstDay = parseISO(`${month}-01`);
  return setDate(firstDay, Math.min(startDay, getDaysInMonth(firstDay)));
}

export function monthPeriodBounds(month: string, startDay: number) {
  const firstDay = parseISO(`${month}-01`);
  const nextMonth = format(addMonths(firstDay, 1), "yyyy-MM");
  return {
    dateFrom: format(monthBoundary(month, startDay), "yyyy-MM-dd"),
    dateTo: format(monthBoundary(nextMonth, startDay), "yyyy-MM-dd"),
  };
}

function shiftMonth(month: string, amount: number) {
  return format(addMonths(parseISO(`${month}-01`), amount), "yyyy-MM");
}

export function currentPeriodMonth(startDay: number, today = todayTaipei()) {
  const currentMonth = today.slice(0, 7);
  if (today >= format(monthBoundary(currentMonth, startDay), "yyyy-MM-dd")) {
    return currentMonth;
  }
  return format(subMonths(parseISO(`${currentMonth}-01`), 1), "yyyy-MM");
}

export function effectiveBounds(
  bounds: DateBounds,
  today = todayTaipei(),
): DateBounds {
  const tomorrow = toExclusiveDate(today);
  return {
    dateFrom: bounds.dateFrom,
    dateTo:
      bounds.dateFrom <= today && bounds.dateTo > tomorrow
        ? tomorrow
        : bounds.dateTo,
  };
}

export function reportPresetBounds(
  preset: Exclude<ReportPreset, "custom">,
  startDay: number,
  today = todayTaipei(),
): DateBounds {
  const currentMonth = currentPeriodMonth(startDay, today);
  if (preset === "year") {
    return {
      dateFrom: `${today.slice(0, 4)}-01-01`,
      dateTo: toExclusiveDate(today),
    };
  }

  const periodCount = preset === "last-3" ? 3 : preset === "last-6" ? 6 : 1;
  const endMonth =
    preset === "previous" ? shiftMonth(currentMonth, -1) : currentMonth;
  const startMonth = shiftMonth(endMonth, -(periodCount - 1));
  return {
    dateFrom: monthPeriodBounds(startMonth, startDay).dateFrom,
    dateTo: monthPeriodBounds(endMonth, startDay).dateTo,
  };
}

function precedingEqualDuration(bounds: DateBounds): DateBounds {
  const duration = differenceInCalendarDays(
    parseISO(bounds.dateTo),
    parseISO(bounds.dateFrom),
  );
  return {
    dateFrom: format(
      subDays(parseISO(bounds.dateFrom), duration),
      "yyyy-MM-dd",
    ),
    dateTo: bounds.dateFrom,
  };
}

function cappedDateTo(dateTo: string, maximum: string) {
  return dateTo < maximum ? dateTo : maximum;
}

export function comparisonBoundsForMonth(
  month: string,
  startDay: number,
  mode: ComparisonMode,
  today = todayTaipei(),
): DateBounds {
  const current = monthPeriodBounds(month, startDay);
  const previous = monthPeriodBounds(shiftMonth(month, -1), startDay);
  if (
    mode === "same-progress" &&
    current.dateFrom <= today &&
    today < current.dateTo
  ) {
    const elapsed = differenceInCalendarDays(
      parseISO(effectiveBounds(current, today).dateTo),
      parseISO(current.dateFrom),
    );
    return {
      dateFrom: previous.dateFrom,
      dateTo: cappedDateTo(
        format(addDays(parseISO(previous.dateFrom), elapsed), "yyyy-MM-dd"),
        previous.dateTo,
      ),
    };
  }
  return previous;
}

export function comparisonBoundsForPreset(
  preset: ReportPreset,
  current: DateBounds,
  startDay: number,
  mode: ComparisonMode,
  today = todayTaipei(),
): DateBounds {
  if (preset === "custom" || preset === "previous") {
    return precedingEqualDuration(current);
  }
  if (preset === "year") {
    const previousYear = Number(today.slice(0, 4)) - 1;
    const previous = {
      dateFrom: `${previousYear}-01-01`,
      dateTo: `${previousYear + 1}-01-01`,
    };
    if (mode === "full-previous") return previous;
    const elapsed = differenceInCalendarDays(
      parseISO(effectiveBounds(current, today).dateTo),
      parseISO(current.dateFrom),
    );
    return {
      dateFrom: previous.dateFrom,
      dateTo: cappedDateTo(
        format(addDays(parseISO(previous.dateFrom), elapsed), "yyyy-MM-dd"),
        previous.dateTo,
      ),
    };
  }

  const periodCount = preset === "last-3" ? 3 : preset === "last-6" ? 6 : 1;
  const currentMonth = currentPeriodMonth(startDay, today);
  const previousEndMonth = shiftMonth(currentMonth, -periodCount);
  const previousStartMonth = shiftMonth(previousEndMonth, -(periodCount - 1));
  const previous = {
    dateFrom: monthPeriodBounds(previousStartMonth, startDay).dateFrom,
    dateTo: monthPeriodBounds(previousEndMonth, startDay).dateTo,
  };
  if (mode === "full-previous") return previous;
  const elapsed = differenceInCalendarDays(
    parseISO(effectiveBounds(current, today).dateTo),
    parseISO(current.dateFrom),
  );
  return {
    dateFrom: previous.dateFrom,
    dateTo: cappedDateTo(
      format(addDays(parseISO(previous.dateFrom), elapsed), "yyyy-MM-dd"),
      previous.dateTo,
    ),
  };
}

export function trendGranularity(bounds: DateBounds): "day" | "week" | "month" {
  const days = differenceInCalendarDays(
    parseISO(bounds.dateTo),
    parseISO(bounds.dateFrom),
  );
  if (days <= 45) return "day";
  if (days <= 180) return "week";
  return "month";
}

export function formatLedgerDate(value: string) {
  return format(parseISO(value), "M 月 d 日 EEEE", { locale: zhTW });
}

export function formatShortDate(value: string) {
  return format(parseISO(value), "yyyy/MM/dd");
}

export function formatTimestamp(value: string) {
  return formatInTimeZone(value, APP_TIME_ZONE, "yyyy/MM/dd HH:mm");
}

export function monthLabel(month: string) {
  return format(parseISO(`${month}-01`), "yyyy 年 M 月", { locale: zhTW });
}
