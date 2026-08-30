import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { PickerField } from "@/components/ui/picker-field";
import { useIsMobile } from "@/hooks/use-mobile";
import { monthLabel, todayTaipei } from "@/lib/format";

type MonthPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  "aria-label": string;
  className?: string;
  disabled?: boolean;
};

function parseMonth(value: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);

  if (!match) throw new Error(`Invalid month value: ${value}`);

  return { year: Number(match[1]), month: Number(match[2]) };
}

function formatMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseMonthInput(input: string) {
  const digits = input.trim().replace(/[^\d]/g, "");
  if (digits.length !== 6) return undefined;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4));
  if (year < 1 || month < 1 || month > 12) return undefined;
  return formatMonthValue(year, month);
}

function formatMonthInput(value: string) {
  const { year, month } = parseMonth(value);
  return `${year}/${String(month).padStart(2, "0")}`;
}

function MonthPicker({
  value,
  onValueChange,
  className,
  disabled = false,
  "aria-label": ariaLabel,
}: MonthPickerProps) {
  const isMobile = useIsMobile();
  const selected = parseMonth(value);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(() => formatMonthInput(value));
  const [error, setError] = React.useState<string>();
  const [displayYear, setDisplayYear] = React.useState(selected.year);
  const errorId = `${ariaLabel.replace(/\s+/g, "-")}-month-error`;

  React.useEffect(() => {
    setDraft(formatMonthInput(value));
    setError(undefined);
  }, [value]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setDraft(formatMonthInput(value));
      setError(undefined);
      setDisplayYear(selected.year);
    }
  }

  function updateDraft(nextDraft: string) {
    setDraft(nextDraft);
    const parsed = parseMonthInput(nextDraft);
    if (parsed) setDisplayYear(parseMonth(parsed).year);
    if (error) setError(parsed ? undefined : "請輸入有效月份（YYYY/MM）。");
  }

  function commitDraft(close = false) {
    const parsed = parseMonthInput(draft);
    if (!parsed) {
      setError("請輸入有效月份（YYYY/MM）。");
      return false;
    }
    setDraft(formatMonthInput(parsed));
    setError(undefined);
    onValueChange(parsed);
    if (close) setOpen(false);
    return true;
  }

  function selectMonth(month: number) {
    const nextValue = formatMonthValue(displayYear, month);
    setDraft(formatMonthInput(nextValue));
    setError(undefined);
    onValueChange(nextValue);
    setOpen(false);
  }

  function focusMonth(month: number) {
    document
      .querySelector<HTMLButtonElement>(`[data-month-option="${month}"]`)
      ?.focus();
  }

  function handleMonthKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    month: number,
  ) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -3,
      ArrowDown: 3,
    };
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusMonth(event.key === "Home" ? 1 : 12);
      return;
    }
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const rawNext = month + offset;
    if (rawNext < 1) {
      setDisplayYear((year) => year - 1);
      requestAnimationFrame(() => focusMonth(12 + rawNext));
    } else if (rawNext > 12) {
      setDisplayYear((year) => year + 1);
      requestAnimationFrame(() => focusMonth(rawNext - 12));
    } else {
      focusMonth(rawNext);
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft(isMobile);
    } else if (event.key === "Escape") {
      setDraft(formatMonthInput(value));
      setError(undefined);
      setOpen(false);
    }
  }

  const currentMonth = todayTaipei().slice(0, 7);

  return (
    <div className="grid gap-1">
      <PickerField
        inputValue={draft}
        mobileValue={monthLabel(value)}
        onInputChange={(event) => updateDraft(event.target.value)}
        onInputBlur={() => {
          if (isMobile) {
            setError(
              parseMonthInput(draft)
                ? undefined
                : "請輸入有效月份（YYYY/MM）。",
            );
          } else {
            commitDraft();
          }
        }}
        onInputKeyDown={handleInputKeyDown}
        placeholder="YYYY/MM"
        disabled={disabled}
        invalid={Boolean(error)}
        describedBy={error ? errorId : undefined}
        aria-label={ariaLabel}
        mobileInputLabel={`${ariaLabel}手動輸入`}
        className={className}
        open={open}
        onOpenChange={handleOpenChange}
        title={ariaLabel}
        align="end"
        desktopContentClassName="w-64"
        mobileContentClassName="max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)]"
        onDesktopOpenAutoFocus={(event) => {
          event.preventDefault();
          focusMonth(selected.month);
        }}
        footer={
          <Button
            type="button"
            disabled={disabled || value === currentMonth}
            onClick={() => {
              setDraft(formatMonthInput(currentMonth));
              setError(undefined);
              onValueChange(currentMonth);
              setOpen(false);
            }}
          >
            本月
          </Button>
        }
      >
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="上一年"
            onClick={() => setDisplayYear((year) => year - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <p className="font-medium" aria-live="polite">
            {displayYear} 年
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="下一年"
            onClick={() => setDisplayYear((year) => year + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <div
          role="group"
          className="grid grid-cols-3 gap-1"
          aria-label={`${displayYear} 年月份`}
        >
          {Array.from({ length: 12 }, (_, index) => {
            const month = index + 1;
            const isSelected =
              displayYear === selected.year && month === selected.month;
            return (
              <Button
                key={month}
                data-month-option={month}
                type="button"
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className={isMobile ? "h-11" : undefined}
                aria-label={`${month} 月`}
                aria-pressed={isSelected}
                tabIndex={isSelected || selected.month === month ? 0 : -1}
                onClick={() => selectMonth(month)}
                onKeyDown={(event) => handleMonthKeyDown(event, month)}
              >
                {month} 月
              </Button>
            );
          })}
        </div>
      </PickerField>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { MonthPicker };
