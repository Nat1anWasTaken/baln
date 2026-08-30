import type { ReactNode } from "react";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type ResponsivePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  align?: "start" | "center" | "end";
  desktopContentClassName?: string;
  mobileBodyClassName?: string;
  mobileContentClassName?: string;
  mobileSize?: "content" | "near-full";
  onDesktopOpenAutoFocus?: (event: Event) => void;
};

function ResponsivePicker({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  align = "start",
  desktopContentClassName,
  mobileBodyClassName,
  mobileContentClassName,
  mobileSize = "content",
  onDesktopOpenAutoFocus,
}: ResponsivePickerProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          size={mobileSize}
          className={mobileContentClassName}
          closeLabel={`關閉${title}`}
          tabIndex={-1}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus({
              preventScroll: true,
            });
          }}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description ? (
              <SheetDescription>{description}</SheetDescription>
            ) : null}
          </SheetHeader>
          <SheetBody className={mobileBodyClassName}>{children}</SheetBody>
          {footer ? <SheetFooter>{footer}</SheetFooter> : null}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn("gap-3", desktopContentClassName)}
        onOpenAutoFocus={onDesktopOpenAutoFocus}
      >
        {description ? (
          <PopoverHeader>
            <PopoverTitle>{title}</PopoverTitle>
            <PopoverDescription>{description}</PopoverDescription>
          </PopoverHeader>
        ) : (
          <PopoverTitle className="sr-only">{title}</PopoverTitle>
        )}
        {children}
        {footer ? <div className="flex justify-end gap-2">{footer}</div> : null}
      </PopoverContent>
    </Popover>
  );
}

export { ResponsivePicker };
export type { ResponsivePickerProps };
