"use client";

import * as React from "react";
import { AnimatePresence, m } from "motion/react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import {
  floatingMotion,
  type MotionSafeProps,
  useInstantMotion,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

const TooltipMotionContext = React.createContext(false);
const MotionTooltipContent = m.create(TooltipPrimitive.Content);

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  children,
  defaultOpen,
  onOpenChange,
  open,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const resolvedOpen = open ?? internalOpen;
  return (
    <TooltipMotionContext.Provider value={resolvedOpen}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        open={resolvedOpen}
        onOpenChange={(nextOpen) => {
          setInternalOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }}
        {...props}
      >
        {children}
      </TooltipPrimitive.Root>
    </TooltipMotionContext.Provider>
  );
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: MotionSafeProps<React.ComponentProps<typeof TooltipPrimitive.Content>>) {
  const open = React.useContext(TooltipMotionContext);
  const instant = useInstantMotion();
  return (
    <TooltipPrimitive.Portal forceMount>
      <AnimatePresence>
        {open ? (
          <MotionTooltipContent
            forceMount
            data-slot="tooltip-content"
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
              "z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-xl bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-lg",
              className,
            )}
            {...props}
          >
            {children}
            <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=left]:translate-x-[-1.5px] data-[side=right]:translate-x-[1.5px]" />
          </MotionTooltipContent>
        ) : null}
      </AnimatePresence>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
