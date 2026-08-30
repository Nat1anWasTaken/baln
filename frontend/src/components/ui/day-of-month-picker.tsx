import { CalendarRange } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { PickerField } from "@/components/ui/picker-field";
import { useIsMobile } from "@/hooks/use-mobile";

type DayOfMonthPickerProps = {
  value: number;
  onValueChange: (value: number) => void;
  "aria-label": string;
  className?: string;
  disabled?: boolean;
};

function parseDayInput(input: string) {
  if (!/^\d{1,2}$/.test(input.trim())) return undefined;
  const day = Number(input);
  return day >= 1 && day <= 31 ? day : undefined;
}

function DayOfMonthPicker({
  value,
  onValueChange,
  className,
  disabled = false,
  "aria-label": ariaLabel,
}: DayOfMonthPickerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(String(value));
  const [error, setError] = React.useState<string>();
  const errorId = `${ariaLabel.replace(/\s+/g, "-")}-day-error`;

  React.useEffect(() => {
    setDraft(String(value));
    setError(undefined);
  }, [value]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setDraft(String(value));
      setError(undefined);
    }
  }

  function updateDraft(nextDraft: string) {
    setDraft(nextDraft);
    if (error) {
      setError(
        parseDayInput(nextDraft) ? undefined : "請輸入 1 到 31 的日期。",
      );
    }
  }

  function commitDraft(close = false) {
    const day = parseDayInput(draft);
    if (!day) {
      setError("請輸入 1 到 31 的日期。");
      return false;
    }
    setDraft(String(day));
    setError(undefined);
    onValueChange(day);
    if (close) setOpen(false);
    return true;
  }

  function selectDay(day: number) {
    setDraft(String(day));
    setError(undefined);
    onValueChange(day);
    setOpen(false);
  }

  function focusDay(day: number) {
    document
      .querySelector<HTMLButtonElement>(`[data-day-of-month="${day}"]`)
      ?.focus();
  }

  function handleDayKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    day: number,
  ) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusDay(event.key === "Home" ? 1 : 31);
      return;
    }
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    focusDay(Math.min(31, Math.max(1, day + offset)));
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft(isMobile);
    } else if (event.key === "Escape") {
      setDraft(String(value));
      setError(undefined);
      setOpen(false);
    }
  }

  return (
    <div className="grid gap-1">
      <PickerField
        inputValue={draft}
        mobileValue={`每月 ${value} 日開始`}
        onInputChange={(event) => updateDraft(event.target.value)}
        onInputBlur={() => {
          if (isMobile) {
            setError(
              parseDayInput(draft) ? undefined : "請輸入 1 到 31 的日期。",
            );
          } else {
            commitDraft();
          }
        }}
        onInputKeyDown={handleInputKeyDown}
        placeholder="1–31"
        disabled={disabled}
        invalid={Boolean(error)}
        describedBy={error ? errorId : undefined}
        aria-label={ariaLabel}
        mobileInputLabel={`${ariaLabel}手動輸入`}
        className={className}
        icon={<CalendarRange aria-hidden="true" />}
        desktopSuffix="日"
        open={open}
        onOpenChange={handleOpenChange}
        title={ariaLabel}
        description="當月沒有此日期時，改由該月最後一天開始。"
        align="end"
        desktopContentClassName="w-72"
        mobileContentClassName="max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)]"
        onDesktopOpenAutoFocus={(event) => {
          event.preventDefault();
          focusDay(value);
        }}
      >
        <div
          role="group"
          className="grid grid-cols-7 gap-0"
          aria-label="選擇每月起始日"
        >
          {Array.from({ length: 31 }, (_, index) => {
            const day = index + 1;
            const isSelected = day === value;
            return (
              <Button
                key={day}
                data-day-of-month={day}
                type="button"
                variant={isSelected ? "default" : "ghost"}
                size="icon-sm"
                className={isMobile ? "size-11" : undefined}
                aria-label={`${day} 日`}
                aria-pressed={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => selectDay(day)}
                onKeyDown={(event) => handleDayKeyDown(event, day)}
              >
                {day}
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

export { DayOfMonthPicker };
