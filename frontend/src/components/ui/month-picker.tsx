import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type MonthPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  "aria-label": string;
  className?: string;
};

function parseMonth(value: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);

  if (!match) {
    throw new Error(`Invalid month value: ${value}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

function formatMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function MonthPicker({
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: MonthPickerProps) {
  const selected = parseMonth(value);
  const [open, setOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(selected.year);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setDisplayYear(selected.year);
    }
  }

  function selectMonth(month: number) {
    onValueChange(formatMonthValue(displayYear, month));
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn("w-40 justify-start", className)}
        >
          <CalendarDays aria-hidden="true" />
          <span>{monthLabel(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
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
                type="button"
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                aria-label={`${month} 月`}
                aria-pressed={isSelected}
                onClick={() => selectMonth(month)}
              >
                {month} 月
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { MonthPicker };
