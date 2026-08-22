"use client";

import * as React from "react";
import { AnimatePresence, m } from "motion/react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { useDialogPortalContainer } from "@/components/ui/dialog";
import {
  floatingMotion,
  type MotionSafeProps,
  pressMotionProps,
  type PressFeedback,
  useInstantMotion,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronRightIcon } from "lucide-react";

const DropdownMotionContext = React.createContext(false);
const DropdownSubMotionContext = React.createContext(false);
const MotionDropdownTrigger = m.create(DropdownMenuPrimitive.Trigger);
const MotionDropdownContent = m.create(DropdownMenuPrimitive.Content);
const MotionDropdownItem = m.create(DropdownMenuPrimitive.Item);
const MotionDropdownCheckboxItem = m.create(DropdownMenuPrimitive.CheckboxItem);
const MotionDropdownRadioItem = m.create(DropdownMenuPrimitive.RadioItem);
const MotionDropdownSubTrigger = m.create(DropdownMenuPrimitive.SubTrigger);
const MotionDropdownSubContent = m.create(DropdownMenuPrimitive.SubContent);

function DropdownMenu({
  children,
  defaultOpen,
  onOpenChange,
  open,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const resolvedOpen = open ?? internalOpen;
  return (
    <DropdownMotionContext.Provider value={resolvedOpen}>
      <DropdownMenuPrimitive.Root
        data-slot="dropdown-menu"
        open={resolvedOpen}
        onOpenChange={(nextOpen) => {
          setInternalOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
        {...props}
      >
        {children}
      </DropdownMenuPrimitive.Root>
    </DropdownMotionContext.Provider>
  );
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  const dialogPortalContainer = useDialogPortalContainer();

  return (
    <DropdownMenuPrimitive.Portal
      container={dialogPortalContainer ?? undefined}
      data-slot="dropdown-menu-portal"
      {...props}
    />
  );
}

function DropdownMenuTrigger({
  pressFeedback = "control",
  ...props
}: MotionSafeProps<
  React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>
> & {
  pressFeedback?: PressFeedback;
}) {
  return (
    <MotionDropdownTrigger
      data-slot="dropdown-menu-trigger"
      {...pressMotionProps(pressFeedback, Boolean(props.disabled))}
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: MotionSafeProps<
  React.ComponentProps<typeof DropdownMenuPrimitive.Content>
>) {
  const dialogPortalContainer = useDialogPortalContainer();
  const open = React.useContext(DropdownMotionContext);
  const instant = useInstantMotion();

  return (
    <DropdownMenuPrimitive.Portal
      forceMount
      container={dialogPortalContainer ?? undefined}
    >
      <AnimatePresence>
        {open ? (
          <MotionDropdownContent
            forceMount
            data-slot="dropdown-menu-content"
            sideOffset={sideOffset}
            align={align}
            initial={instant ? false : floatingMotion.initial}
            animate={floatingMotion.animate}
            exit={
              instant
                ? undefined
                : {
                    ...floatingMotion.exit,
                    transition: floatingMotion.exitTransition,
                  }
            }
            transition={instant ? { duration: 0 } : floatingMotion.transition}
            className={cn(
              "cn-menu-target cn-menu-translucent z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-48 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-3xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10",
              className,
            )}
            {...props}
          />
        ) : null}
      </AnimatePresence>
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  );
}

function DropdownMenuItem({
  className,
  disabled,
  inset,
  variant = "default",
  ...props
}: MotionSafeProps<React.ComponentProps<typeof DropdownMenuPrimitive.Item>> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <MotionDropdownItem
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      disabled={disabled}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default touch-manipulation items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-medium outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-9.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className,
      )}
      {...pressMotionProps("control", disabled)}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  disabled,
  inset,
  ...props
}: MotionSafeProps<
  React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>
> & {
  inset?: boolean;
}) {
  return (
    <MotionDropdownCheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      disabled={disabled}
      className={cn(
        "relative flex cursor-default touch-manipulation items-center gap-2.5 rounded-2xl py-2 pr-8 pl-3 text-sm font-medium outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-9.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...pressMotionProps("control", disabled)}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MotionDropdownCheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  disabled,
  ...props
}: MotionSafeProps<
  React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>
> & {
  inset?: boolean;
}) {
  return (
    <MotionDropdownRadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      disabled={disabled}
      className={cn(
        "relative flex cursor-default touch-manipulation items-center gap-2.5 rounded-2xl py-2 pr-8 pl-3 text-sm font-medium outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-9.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...pressMotionProps("control", disabled)}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MotionDropdownRadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-3 py-2.5 text-xs text-muted-foreground data-inset:pl-9.5",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-border/50", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({
  children,
  defaultOpen,
  onOpenChange,
  open,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const resolvedOpen = open ?? internalOpen;
  return (
    <DropdownSubMotionContext.Provider value={resolvedOpen}>
      <DropdownMenuPrimitive.Sub
        data-slot="dropdown-menu-sub"
        open={resolvedOpen}
        onOpenChange={(nextOpen) => {
          setInternalOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
        {...props}
      >
        {children}
      </DropdownMenuPrimitive.Sub>
    </DropdownSubMotionContext.Provider>
  );
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  disabled,
  ...props
}: MotionSafeProps<
  React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>
> & {
  inset?: boolean;
}) {
  return (
    <MotionDropdownSubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      disabled={disabled}
      className={cn(
        "flex cursor-default touch-manipulation items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-9.5 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...pressMotionProps("control", disabled)}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MotionDropdownSubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  ...props
}: MotionSafeProps<
  React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>
>) {
  const open = React.useContext(DropdownSubMotionContext);
  const instant = useInstantMotion();
  return (
    <AnimatePresence>
      {open ? (
        <MotionDropdownSubContent
          forceMount
          data-slot="dropdown-menu-sub-content"
          initial={instant ? false : floatingMotion.initial}
          animate={floatingMotion.animate}
          exit={
            instant
              ? undefined
              : {
                  ...floatingMotion.exit,
                  transition: floatingMotion.exitTransition,
                }
          }
          transition={instant ? { duration: 0 } : floatingMotion.transition}
          className={cn(
            "cn-menu-target cn-menu-translucent z-50 min-w-36 origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-3xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10",
            className,
          )}
          {...props}
        />
      ) : null}
    </AnimatePresence>
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
