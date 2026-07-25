import { CalendarRange } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DayOfMonthPickerProps = {
  value: number;
  onValueChange: (value: number) => void;
  "aria-label": string;
  className?: string;
};

function DayOfMonthPicker({
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: DayOfMonthPickerProps) {
  const [open, setOpen] = useState(false);

  function selectDay(day: number) {
    onValueChange(day);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn("w-40 justify-start", className)}
        >
          <CalendarRange aria-hidden="true" />
          <span>每月 {value} 日開始</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle>每月起始日</PopoverTitle>
          <PopoverDescription>
            當月沒有此日期時，改由該月最後一天開始。
          </PopoverDescription>
        </PopoverHeader>
        <div
          role="group"
          className="grid grid-cols-7 gap-1"
          aria-label="選擇每月起始日"
        >
          {Array.from({ length: 31 }, (_, index) => {
            const day = index + 1;
            const isSelected = day === value;
            return (
              <Button
                key={day}
                type="button"
                variant={isSelected ? "default" : "ghost"}
                size="icon-sm"
                aria-label={`${day} 日`}
                aria-pressed={isSelected}
                onClick={() => selectDay(day)}
              >
                {day}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DayOfMonthPicker };
