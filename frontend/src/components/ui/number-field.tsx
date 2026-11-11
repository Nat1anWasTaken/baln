import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericKeypad } from "@/components/ui/numeric-keypad";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatInteger } from "@/lib/format";
import {
  applyKeypadKey,
  keypadDigits,
  keypadValue,
  type NumericKeypadKey,
} from "@/lib/numeric-keypad";
import { cn } from "@/lib/utils";

/** A large read-out of the number a keypad is building. */
export function NumericKeypadDisplay({
  digits,
  id,
  label,
  prefix,
  className,
  ...props
}: Omit<React.ComponentProps<"output">, "children"> & {
  digits: string;
  label: string;
  prefix?: React.ReactNode;
}) {
  return (
    <output
      id={id}
      aria-label={label}
      aria-live="polite"
      data-empty={digits === "" || undefined}
      className={cn(
        "flex min-w-0 items-baseline justify-center gap-1 font-heading text-5xl font-semibold tracking-tight tabular-nums outline-none data-empty:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {prefix ? (
        <span className="text-2xl font-medium text-muted-foreground">
          {prefix}
        </span>
      ) : null}
      <span className="truncate">
        {digits === "" ? "0" : formatInteger(keypadValue(digits))}
      </span>
    </output>
  );
}

type NumberFieldProps = {
  id?: string;
  name?: string;
  value: number;
  onValueChange: (value: number) => void;
  onBlur?: () => void;
  /** Names the keypad sheet on phones. */
  title: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/**
 * A positive whole-number field. Desktop keeps the native number input; phones
 * open a sheet with an on-screen keypad so the system keyboard never covers
 * the form.
 */
const NumberField = React.forwardRef<
  HTMLInputElement | HTMLButtonElement,
  NumberFieldProps
>(function NumberField(
  {
    id,
    name,
    value,
    onValueChange,
    onBlur,
    title,
    placeholder = "0",
    disabled,
    className,
    "aria-label": ariaLabel,
    "aria-invalid": invalid,
    "aria-describedby": describedBy,
  },
  ref,
) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(() => keypadDigits(value));

  if (!isMobile) {
    return (
      <Input
        ref={ref as React.Ref<HTMLInputElement>}
        id={id}
        name={name}
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={className}
        value={Number.isFinite(value) && value !== 0 ? value : ""}
        onBlur={onBlur}
        onChange={(event) =>
          onValueChange(
            event.target.value === "" ? 0 : event.target.valueAsNumber,
          )
        }
      />
    );
  }

  const hasValue = Number.isFinite(value) && value !== 0;

  return (
    <ResponsivePicker
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setDraft(keypadDigits(value));
        else onBlur?.();
      }}
      title={title}
      mobileBodyClassName="grid place-items-center py-4"
      trigger={
        <Button
          ref={ref as React.Ref<HTMLButtonElement>}
          id={id}
          name={name}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(
            "w-full justify-start font-normal tabular-nums",
            !hasValue && "text-muted-foreground",
            className,
          )}
        >
          {hasValue ? formatInteger(value) : placeholder}
        </Button>
      }
      footer={
        <NumericKeypad
          onKey={(key: NumericKeypadKey) =>
            setDraft((digits) => applyKeypadKey(digits, key))
          }
          action={
            <Button
              type="button"
              className="h-full rounded-3xl text-base"
              onClick={() => {
                onValueChange(keypadValue(draft));
                setOpen(false);
                onBlur?.();
              }}
            >
              完成
            </Button>
          }
        />
      }
    >
      <NumericKeypadDisplay digits={draft} label={`${title}輸入值`} />
    </ResponsivePicker>
  );
});

export { NumberField };
