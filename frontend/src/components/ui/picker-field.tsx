import { CalendarDays } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  ResponsivePicker,
  type ResponsivePickerProps,
} from "@/components/ui/responsive-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type PickerFieldProps = Pick<
  ResponsivePickerProps,
  | "open"
  | "onOpenChange"
  | "title"
  | "description"
  | "children"
  | "footer"
  | "align"
  | "desktopContentClassName"
  | "mobileBodyClassName"
  | "mobileContentClassName"
  | "mobileSize"
  | "onDesktopOpenAutoFocus"
> & {
  id?: string;
  inputValue: string;
  mobileValue: string;
  onInputChange: React.ChangeEventHandler<HTMLInputElement>;
  onInputBlur?: React.FocusEventHandler<HTMLInputElement>;
  onInputFocus?: React.FocusEventHandler<HTMLInputElement>;
  onInputKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  inputRef?: React.Ref<HTMLInputElement>;
  triggerRef?: React.Ref<HTMLButtonElement>;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  icon?: React.ReactNode;
  desktopSuffix?: React.ReactNode;
  "aria-label"?: string;
  mobileInputLabel?: string;
};

function PickerField({
  id,
  inputValue,
  mobileValue,
  onInputChange,
  onInputBlur,
  onInputFocus,
  onInputKeyDown,
  inputRef,
  triggerRef,
  inputMode = "numeric",
  placeholder,
  disabled = false,
  invalid = false,
  describedBy,
  className,
  icon = <CalendarDays aria-hidden="true" />,
  desktopSuffix,
  "aria-label": ariaLabel,
  mobileInputLabel,
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  align,
  desktopContentClassName,
  mobileBodyClassName,
  mobileContentClassName,
  mobileSize,
  onDesktopOpenAutoFocus,
}: PickerFieldProps) {
  const isMobile = useIsMobile();
  const accessibleLabel = ariaLabel ?? title;
  const inputProps = {
    id,
    value: inputValue,
    disabled,
    inputMode,
    autoComplete: "off",
    placeholder,
    "aria-describedby": describedBy,
    "aria-invalid": invalid,
    onChange: onInputChange,
    onBlur: onInputBlur,
    onFocus: onInputFocus,
    onKeyDown: onInputKeyDown,
  } as const;

  if (isMobile) {
    return (
      <ResponsivePicker
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        footer={footer}
        align={align}
        desktopContentClassName={desktopContentClassName}
        mobileBodyClassName={cn("grid gap-4 px-1.5 pt-0", mobileBodyClassName)}
        mobileContentClassName={mobileContentClassName}
        mobileSize={mobileSize}
        onDesktopOpenAutoFocus={onDesktopOpenAutoFocus}
        trigger={
          <Button
            ref={triggerRef}
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={accessibleLabel}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className={cn("w-full justify-start font-normal", className)}
          >
            {icon}
            <span>{mobileValue || placeholder}</span>
          </Button>
        }
      >
        <div className="px-[1.125rem]">
          <Input
            {...inputProps}
            aria-label={mobileInputLabel ?? `${accessibleLabel}手動輸入`}
          />
        </div>
        {children}
      </ResponsivePicker>
    );
  }

  return (
    <InputGroup className={className}>
      <InputGroupInput ref={inputRef} {...inputProps} aria-label={ariaLabel} />
      <InputGroupAddon align="inline-end">
        {desktopSuffix ? (
          <InputGroupText>{desktopSuffix}</InputGroupText>
        ) : null}
        <ResponsivePicker
          open={open}
          onOpenChange={onOpenChange}
          title={title}
          description={description}
          footer={footer}
          align={align}
          desktopContentClassName={desktopContentClassName}
          mobileBodyClassName={mobileBodyClassName}
          mobileContentClassName={mobileContentClassName}
          mobileSize={mobileSize}
          onDesktopOpenAutoFocus={onDesktopOpenAutoFocus}
          trigger={
            <InputGroupButton
              size="icon-xs"
              disabled={disabled}
              aria-label={`開啟${title}`}
            >
              {icon}
            </InputGroupButton>
          }
        >
          {children}
        </ResponsivePicker>
      </InputGroupAddon>
    </InputGroup>
  );
}

export { PickerField };
export type { PickerFieldProps };
