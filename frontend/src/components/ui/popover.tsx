import * as React from "react";
import { AnimatePresence, m } from "motion/react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { useDialogPortalContainer } from "@/components/ui/dialog";
import {
  floatingMotion,
  type MotionSafeProps,
  PressMotionBoundary,
  type PressFeedback,
  useInstantMotion,
  useOwnedPressMotionProps,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

const PopoverMotionContext = React.createContext(false);
const MotionPopoverTrigger = m.create(PopoverPrimitive.Trigger);
const MotionPopoverContent = m.create(PopoverPrimitive.Content);

function Popover({
  children,
  defaultOpen,
  onOpenChange,
  open,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const resolvedOpen = open ?? internalOpen;
  return (
    <PopoverMotionContext.Provider value={resolvedOpen}>
      <PopoverPrimitive.Root
        data-slot="popover"
        open={resolvedOpen}
        onOpenChange={(nextOpen) => {
          setInternalOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
        {...props}
      >
        {children}
      </PopoverPrimitive.Root>
    </PopoverMotionContext.Provider>
  );
}

function PopoverTrigger({
  pressFeedback = "control",
  ...props
}: MotionSafeProps<React.ComponentProps<typeof PopoverPrimitive.Trigger>> & {
  pressFeedback?: PressFeedback;
}) {
  const pressMotion = useOwnedPressMotionProps(
    pressFeedback,
    Boolean(props.disabled),
  );

  return (
    <PressMotionBoundary>
      <MotionPopoverTrigger
        data-slot="popover-trigger"
        {...pressMotion}
        {...props}
      />
    </PressMotionBoundary>
  );
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: MotionSafeProps<React.ComponentProps<typeof PopoverPrimitive.Content>>) {
  const dialogPortalContainer = useDialogPortalContainer();
  const open = React.useContext(PopoverMotionContext);
  const instant = useInstantMotion();

  return (
    <PopoverPrimitive.Portal
      forceMount
      container={dialogPortalContainer ?? undefined}
    >
      <AnimatePresence>
        {open ? (
          <MotionPopoverContent
            forceMount
            data-slot="popover-content"
            align={align}
            sideOffset={sideOffset}
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
              "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-4 rounded-3xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-hidden dark:ring-foreground/10",
              className,
            )}
            {...props}
          />
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("text-base font-medium", className)}
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
