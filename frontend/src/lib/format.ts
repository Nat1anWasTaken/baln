import {
  addDays,
  addMonths,
  format,
  getDaysInMonth,
  parseISO,
  setDate,
  startOfMonth,
  subMonths,
} from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { zhTW } from "date-fns/locale";

export const APP_TIME_ZONE = "Asia/Taipei";

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

export function currentPeriodMonth(startDay: number, today = todayTaipei()) {
  const currentMonth = today.slice(0, 7);
  if (today >= format(monthBoundary(currentMonth, startDay), "yyyy-MM-dd")) {
    return currentMonth;
  }
  return format(subMonths(parseISO(`${currentMonth}-01`), 1), "yyyy-MM");
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
