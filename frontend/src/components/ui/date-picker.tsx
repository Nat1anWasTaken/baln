import { zhTW } from "date-fns/locale";
import { CalendarRange } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { PickerField } from "@/components/ui/picker-field";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  dateValueToDate,
  dateWithinBounds,
  formatDateForDisplay,
  formatDateValue,
  parseDateInput,
} from "@/lib/date-input";
import { todayTaipei } from "@/lib/format";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  onValidityChange?: (valid: boolean) => void;
  min?: string;
  max?: string;
  required?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  pickerTitle?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

type DateDraftValidation = {
  canonical: string;
  error?: string;
  valid: boolean;
};

function validateDateDraft(
  draft: string,
  { min, max, required }: Pick<DatePickerProps, "min" | "max" | "required">,
): DateDraftValidation {
  if (!draft.trim()) {
    return required
      ? { canonical: "", error: "請選擇日期。", valid: false }
      : { canonical: "", valid: true };
  }

  const canonical = parseDateInput(draft);
  if (!canonical) {
    return {
      canonical: "",
      error: "請輸入有效日期（YYYY/MM/DD）。",
      valid: false,
    };
  }
  if (min && canonical < min) {
    return {
      canonical,
      error: `日期不得早於 ${formatDateForDisplay(min)}。`,
      valid: false,
    };
  }
  if (max && canonical > max) {
    return {
      canonical,
      error: `日期不得晚於 ${formatDateForDisplay(max)}。`,
      valid: false,
    };
  }
  return { canonical, valid: true };
}

const DatePicker = React.forwardRef<HTMLElement, DatePickerProps>(
  function DatePicker(
    {
      id,
      value,
      onValueChange,
      onValidityChange,
      min,
      max,
      required = false,
      clearable = !required,
      disabled = false,
      className,
      placeholder = "YYYY/MM/DD",
      pickerTitle = "選擇日期",
      "aria-label": ariaLabel,
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
    },
    forwardedRef,
  ) {
    const isMobile = useIsMobile();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const [open, setOpen] = React.useState(false);
    const [draft, setDraft] = React.useState(() => formatDateForDisplay(value));
    const [error, setError] = React.useState<string>();
    const [calendarMonth, setCalendarMonth] = React.useState<Date | undefined>(
      () => dateValueToDate(value) ?? dateValueToDate(todayTaipei()),
    );
    const errorId = `${id}-date-error`;
    const invalid = Boolean(ariaInvalid || error);
    const describedBy =
      [ariaDescribedBy, error ? errorId : undefined]
        .filter(Boolean)
        .join(" ") || undefined;
    const selected = dateValueToDate(value);
    const today = todayTaipei();
    const todayAllowed = dateWithinBounds(today, min, max);

    React.useImperativeHandle(
      forwardedRef,
      () => (isMobile ? triggerRef.current : inputRef.current) as HTMLElement,
      [isMobile],
    );

    React.useEffect(() => {
      setDraft(formatDateForDisplay(value));
      setError(undefined);
    }, [value]);

    React.useEffect(() => {
      onValidityChange?.(
        validateDateDraft(formatDateForDisplay(value), {
          min,
          max,
          required,
        }).valid,
      );
    }, [max, min, onValidityChange, required, value]);

    function updateDraft(nextDraft: string) {
      setDraft(nextDraft);
      const result = validateDateDraft(nextDraft, { min, max, required });
      onValidityChange?.(result.valid);
      if (result.canonical) {
        setCalendarMonth(dateValueToDate(result.canonical));
      }
      if (error) setError(result.error);
    }

    function commitDraft(close = false) {
      const result = validateDateDraft(draft, { min, max, required });
      setError(result.error);
      onValidityChange?.(result.valid);
      if (!result.valid) return false;
      setDraft(formatDateForDisplay(result.canonical));
      onValueChange(result.canonical);
      if (close) setOpen(false);
      return true;
    }

    function selectValue(nextValue: string) {
      setDraft(formatDateForDisplay(nextValue));
      setError(undefined);
      onValidityChange?.(true);
      onValueChange(nextValue);
      setOpen(false);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      if (event.key === "Enter") {
        event.preventDefault();
        commitDraft(isMobile);
      } else if (event.key === "Escape") {
        setDraft(formatDateForDisplay(value));
        setError(undefined);
        onValidityChange?.(true);
        setOpen(false);
      }
    }

    const calendar = (
      <Calendar
        mode="single"
        locale={zhTW}
        fixedWeeks
        navLayout="after"
        selected={selected}
        month={calendarMonth}
        onMonthChange={setCalendarMonth}
        disabled={(date) => !dateWithinBounds(formatDateValue(date), min, max)}
        onSelect={(date) => {
          if (date) selectValue(formatDateValue(date));
        }}
        className={cn(
          "mx-auto",
          isMobile && "w-full p-0 [--cell-size:2.75rem]",
        )}
      />
    );

    const actions = (
      <>
        {clearable ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !value}
            onClick={() => selectValue("")}
          >
            清除
          </Button>
        ) : null}
        <Button
          type="button"
          disabled={disabled || !todayAllowed}
          onClick={() => selectValue(today)}
        >
          今天
        </Button>
      </>
    );

    const picker = (
      <PickerField
        inputRef={inputRef}
        triggerRef={triggerRef}
        id={id}
        inputValue={draft}
        mobileValue={formatDateForDisplay(value)}
        onInputChange={(event) => updateDraft(event.target.value)}
        onInputBlur={() => {
          if (isMobile) {
            setError(validateDateDraft(draft, { min, max, required }).error);
          } else {
            commitDraft();
          }
        }}
        onInputKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        invalid={invalid}
        describedBy={describedBy}
        aria-label={ariaLabel}
        mobileInputLabel={`${pickerTitle}手動輸入`}
        className={cn(!value && "text-muted-foreground", className)}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setCalendarMonth(selected ?? dateValueToDate(today));
        }}
        title={pickerTitle}
        desktopContentClassName="w-auto p-3"
        mobileContentClassName="max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)]"
        footer={actions}
      >
        {calendar}
      </PickerField>
    );

    return (
      <div className="grid gap-1">
        {picker}
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

type DateRangeValue = {
  from: string;
  to: string;
};

type DateRangePickerProps = {
  id: string;
  value: DateRangeValue;
  onValueChange: (value: DateRangeValue) => void;
  onValidityChange?: (valid: boolean) => void;
  allowOpenEnded?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  fromLabel?: string;
  toLabel?: string;
  pickerTitle?: string;
  className?: string;
};

type RangeValidation = {
  value: DateRangeValue;
  valid: boolean;
  canCommit: boolean;
  fromError?: string;
  toError?: string;
  rangeError?: string;
};

function validateRangeDraft(
  fromDraft: string,
  toDraft: string,
  {
    allowOpenEnded,
    min,
    max,
  }: Pick<DateRangePickerProps, "allowOpenEnded" | "min" | "max">,
): RangeValidation {
  const from = fromDraft.trim() ? (parseDateInput(fromDraft) ?? "") : "";
  const to = toDraft.trim() ? (parseDateInput(toDraft) ?? "") : "";
  const fromError =
    fromDraft.trim() && !from ? "開始日期格式不正確。" : undefined;
  const toError = toDraft.trim() && !to ? "結束日期格式不正確。" : undefined;
  if (fromError || toError) {
    return {
      value: { from, to },
      valid: false,
      canCommit: false,
      fromError,
      toError,
    };
  }
  if (from && !dateWithinBounds(from, min, max)) {
    return {
      value: { from, to },
      valid: false,
      canCommit: false,
      fromError: "開始日期超出可選範圍。",
    };
  }
  if (to && !dateWithinBounds(to, min, max)) {
    return {
      value: { from, to },
      valid: false,
      canCommit: false,
      toError: "結束日期超出可選範圍。",
    };
  }
  if (from && to && from > to) {
    return {
      value: { from, to },
      valid: false,
      canCommit: false,
      rangeError: "結束日期不得早於開始日期。",
    };
  }
  const complete = Boolean(from && to);
  const empty = !from && !to;
  const valid = allowOpenEnded ? true : complete;
  return {
    value: { from, to },
    valid,
    canCommit: true,
    rangeError:
      !allowOpenEnded && !complete
        ? empty
          ? "請選擇開始與結束日期。"
          : "請完成日期區間。"
        : undefined,
  };
}

function DateRangePicker({
  id,
  value,
  onValueChange,
  onValidityChange,
  allowOpenEnded = false,
  clearable = false,
  disabled = false,
  min,
  max,
  fromLabel = "開始日期",
  toLabel = "結束日期",
  pickerTitle = "選擇日期區間",
  className,
}: DateRangePickerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [activeEndpoint, setActiveEndpoint] = React.useState<"from" | "to">(
    "from",
  );
  const [fromDraft, setFromDraft] = React.useState(() =>
    formatDateForDisplay(value.from),
  );
  const [toDraft, setToDraft] = React.useState(() =>
    formatDateForDisplay(value.to),
  );
  const [validation, setValidation] = React.useState<RangeValidation>(() =>
    validateRangeDraft(
      formatDateForDisplay(value.from),
      formatDateForDisplay(value.to),
      { allowOpenEnded, min, max },
    ),
  );
  const [calendarMonth, setCalendarMonth] = React.useState<Date | undefined>(
    () =>
      dateValueToDate(value.from) ??
      dateValueToDate(value.to) ??
      dateValueToDate(todayTaipei()),
  );

  React.useEffect(() => {
    const nextFrom = formatDateForDisplay(value.from);
    const nextTo = formatDateForDisplay(value.to);
    setFromDraft(nextFrom);
    setToDraft(nextTo);
    setValidation(
      validateRangeDraft(nextFrom, nextTo, { allowOpenEnded, min, max }),
    );
  }, [allowOpenEnded, max, min, value.from, value.to]);

  React.useEffect(() => {
    onValidityChange?.(validation.valid);
  }, [onValidityChange, validation.valid]);

  function updateDraft(from: string, to: string) {
    setFromDraft(from);
    setToDraft(to);
    const next = validateRangeDraft(from, to, {
      allowOpenEnded,
      min,
      max,
    });
    setValidation(next);
    if (!isMobile && next.canCommit) onValueChange(next.value);
    return next;
  }

  function commitDraft() {
    const next = updateDraft(fromDraft, toDraft);
    if (next.canCommit && isMobile) {
      onValueChange(next.value);
      setFromDraft(formatDateForDisplay(next.value.from));
      setToDraft(formatDateForDisplay(next.value.to));
    }
    return next.valid;
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      const nextFrom = formatDateForDisplay(value.from);
      const nextTo = formatDateForDisplay(value.to);
      updateDraft(nextFrom, nextTo);
      setActiveEndpoint(value.from && !value.to ? "to" : "from");
      setCalendarMonth(
        dateValueToDate(value.from) ??
          dateValueToDate(value.to) ??
          dateValueToDate(todayTaipei()),
      );
    }
  }

  function selectCalendarDate(date: Date) {
    const selected = formatDateValue(date);
    const parsed = validateRangeDraft(fromDraft, toDraft, {
      allowOpenEnded: true,
      min,
      max,
    }).value;
    let next: DateRangeValue;
    if (activeEndpoint === "from") {
      next = {
        from: selected,
        to: parsed.to && parsed.to >= selected ? parsed.to : "",
      };
      setActiveEndpoint("to");
    } else {
      if (parsed.from && selected < parsed.from) {
        setValidation({
          ...validation,
          valid: false,
          canCommit: false,
          rangeError: "結束日期不得早於開始日期。",
        });
        return;
      }
      next = { from: parsed.from, to: selected };
      setActiveEndpoint("from");
    }

    updateDraft(formatDateForDisplay(next.from), formatDateForDisplay(next.to));
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const valid = commitDraft();
      if (isMobile && valid) setOpen(false);
    } else if (event.key === "Escape") {
      updateDraft(
        formatDateForDisplay(value.from),
        formatDateForDisplay(value.to),
      );
      setOpen(false);
    }
  }

  const selectedRange = {
    from: dateValueToDate(validation.value.from),
    to: dateValueToDate(validation.value.to),
  };
  const defaultMonth =
    selectedRange.from ?? selectedRange.to ?? dateValueToDate(todayTaipei());
  const calendar = (
    <Calendar
      mode="range"
      locale={zhTW}
      fixedWeeks
      navLayout="after"
      numberOfMonths={isMobile ? 1 : 2}
      month={calendarMonth ?? defaultMonth}
      onMonthChange={setCalendarMonth}
      selected={selectedRange}
      disabled={(date) => !dateWithinBounds(formatDateValue(date), min, max)}
      onDayClick={selectCalendarDate}
      className={cn("mx-auto", isMobile && "w-full p-0 [--cell-size:2.75rem]")}
    />
  );

  const inputFields = (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      <Field data-invalid={Boolean(validation.fromError)}>
        <FieldLabel htmlFor={`${id}-from`}>{fromLabel}</FieldLabel>
        <Input
          id={`${id}-from`}
          value={fromDraft}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="off"
          placeholder="YYYY/MM/DD"
          aria-invalid={Boolean(validation.fromError || validation.rangeError)}
          onFocus={() => setActiveEndpoint("from")}
          onChange={(event) => {
            const nextFrom = event.target.value;
            updateDraft(nextFrom, toDraft);
            const parsed = parseDateInput(nextFrom);
            if (parsed) setCalendarMonth(dateValueToDate(parsed));
          }}
          onBlur={() => {
            if (!isMobile) commitDraft();
          }}
          onKeyDown={handleInputKeyDown}
        />
      </Field>
      <Field data-invalid={Boolean(validation.toError)}>
        <FieldLabel htmlFor={`${id}-to`}>{toLabel}</FieldLabel>
        {isMobile ? (
          <Input
            id={`${id}-to`}
            value={toDraft}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="off"
            placeholder="YYYY/MM/DD"
            aria-invalid={Boolean(validation.toError || validation.rangeError)}
            onFocus={() => setActiveEndpoint("to")}
            onChange={(event) => {
              const nextTo = event.target.value;
              updateDraft(fromDraft, nextTo);
              const parsed = parseDateInput(nextTo);
              if (!fromDraft && parsed) {
                setCalendarMonth(dateValueToDate(parsed));
              }
            }}
            onKeyDown={handleInputKeyDown}
          />
        ) : (
          <InputGroup>
            <InputGroupInput
              id={`${id}-to`}
              value={toDraft}
              disabled={disabled}
              inputMode="numeric"
              autoComplete="off"
              placeholder="YYYY/MM/DD"
              aria-invalid={Boolean(
                validation.toError || validation.rangeError,
              )}
              onFocus={() => setActiveEndpoint("to")}
              onChange={(event) => {
                const nextTo = event.target.value;
                updateDraft(fromDraft, nextTo);
                const parsed = parseDateInput(nextTo);
                if (!fromDraft && parsed) {
                  setCalendarMonth(dateValueToDate(parsed));
                }
              }}
              onBlur={commitDraft}
              onKeyDown={handleInputKeyDown}
            />
            <InputGroupAddon align="inline-end">
              <ResponsivePicker
                open={open}
                onOpenChange={handleOpenChange}
                title={pickerTitle}
                desktopContentClassName="w-auto p-3"
                trigger={
                  <InputGroupButton
                    size="icon-xs"
                    disabled={disabled}
                    aria-label={`開啟${pickerTitle}`}
                  >
                    <CalendarRange aria-hidden="true" />
                  </InputGroupButton>
                }
              >
                {calendar}
              </ResponsivePicker>
            </InputGroupAddon>
          </InputGroup>
        )}
      </Field>
    </div>
  );

  const error =
    validation.fromError ?? validation.toError ?? validation.rangeError;

  if (!isMobile) {
    return (
      <div className="grid gap-1">
        {inputFields}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const rangeLabel =
    value.from || value.to
      ? `${formatDateForDisplay(value.from) || "不限"}–${formatDateForDisplay(value.to) || "不限"}`
      : "不限日期";

  return (
    <div className="grid gap-1">
      <ResponsivePicker
        open={open}
        onOpenChange={handleOpenChange}
        title={pickerTitle}
        mobileContentClassName="max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)]"
        trigger={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={Boolean(error)}
            className={cn(
              "w-full justify-start font-normal",
              !value.from && !value.to && "text-muted-foreground",
              className,
            )}
          >
            <CalendarRange aria-hidden="true" />
            <span>{rangeLabel}</span>
          </Button>
        }
        mobileBodyClassName="grid gap-4 px-1.5 pt-0"
        footer={
          <>
            {clearable ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => updateDraft("", "")}
              >
                清除
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={!validation.valid}
              onClick={() => {
                const next = updateDraft(fromDraft, toDraft);
                if (!next.valid) return;
                onValueChange(next.value);
                setOpen(false);
              }}
            >
              套用
            </Button>
          </>
        }
      >
        <div className="px-[1.125rem]">{inputFields}</div>
        {calendar}
        {error ? (
          <p role="alert" className="px-[1.125rem] text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </ResponsivePicker>
    </div>
  );
}

export { DatePicker, DateRangePicker };
export type { DatePickerProps, DateRangePickerProps, DateRangeValue };
