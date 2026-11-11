import * as React from "react";
import { Delete } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { NumericKeypadKey } from "@/lib/numeric-keypad";
import { cn } from "@/lib/utils";

const digitRows: NumericKeypadKey[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

/** Holding backspace this long clears the whole value. */
const CLEAR_HOLD_MS = 500;

export const numericKeypadKeyClassName =
  "h-12 rounded-3xl text-xl font-medium tabular-nums";

/**
 * An on-screen number pad for phones, so typing an amount never raises the
 * system keyboard over the rest of the form. With an `action`, the pad gains
 * a fourth column whose tall key confirms the value.
 */
export function NumericKeypad({
  onKey,
  action,
  disabled = false,
  className,
  "aria-label": ariaLabel = "數字鍵盤",
}: {
  onKey: (key: NumericKeypadKey) => void;
  /** The confirming key, sized to fill the right column below backspace. */
  action?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const holdTimer = React.useRef<number | null>(null);
  const cleared = React.useRef(false);

  const stopHold = React.useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  React.useEffect(() => stopHold, [stopHold]);

  const key = (value: NumericKeypadKey, className?: string) => (
    <Button
      key={value}
      type="button"
      variant="secondary"
      disabled={disabled}
      data-keypad-key={value}
      className={cn(numericKeypadKeyClassName, className)}
      onClick={() => onKey(value)}
    >
      {value}
    </Button>
  );

  const backspace = (
    <Button
      type="button"
      variant="secondary"
      disabled={disabled}
      data-keypad-key="backspace"
      aria-label="刪除一位，長按清除"
      className={cn(numericKeypadKeyClassName, "[&_svg]:size-6")}
      onPointerDown={() => {
        cleared.current = false;
        stopHold();
        holdTimer.current = window.setTimeout(() => {
          cleared.current = true;
          onKey("clear");
        }, CLEAR_HOLD_MS);
      }}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        // A hold already cleared the value; the release must not delete more.
        if (cleared.current) {
          cleared.current = false;
          return;
        }
        onKey("backspace");
      }}
    >
      <Delete aria-hidden="true" />
    </Button>
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="numeric-keypad"
      className={cn(
        "grid gap-2 select-none",
        action ? "grid-cols-4" : "grid-cols-3",
        className,
      )}
    >
      {digitRows.map((row, index) => (
        <React.Fragment key={row.join("")}>
          {row.map((digit) => key(digit))}
          {action && index === 0 ? backspace : null}
          {action && index === 1 ? (
            <div className="row-span-3 grid">{action}</div>
          ) : null}
        </React.Fragment>
      ))}
      {key("00")}
      {action ? key("0", "col-span-2") : key("0")}
      {action ? null : backspace}
    </div>
  );
}
