"use client";

import * as React from "react";
import { AnimatePresence, m } from "motion/react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import {
  motionSpring,
  type MotionSafeProps,
  PressMotionBoundary,
  useOwnedPressMotionProps,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";

const MotionCheckboxRoot = m.create(CheckboxPrimitive.Root);

function Checkbox({
  className,
  checked,
  defaultChecked,
  disabled,
  onCheckedChange,
  ...props
}: MotionSafeProps<React.ComponentProps<typeof CheckboxPrimitive.Root>>) {
  const [internalChecked, setInternalChecked] = React.useState<
    boolean | "indeterminate"
  >(defaultChecked ?? false);
  const resolvedChecked = checked ?? internalChecked;
  const pressMotion = useOwnedPressMotionProps("icon", disabled);
  return (
    <PressMotionBoundary>
      <MotionCheckboxRoot
        data-slot="checkbox"
        checked={resolvedChecked}
        disabled={disabled}
        onCheckedChange={(nextChecked) => {
          setInternalChecked(nextChecked);
          onCheckedChange?.(nextChecked);
        }}
        className={cn(
          "focus-ring peer relative flex size-4 shrink-0 touch-manipulation items-center justify-center rounded-[5px] border border-transparent bg-input/90 outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-transparent after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary",
          className,
        )}
        {...pressMotion}
        {...props}
      >
        <CheckboxPrimitive.Indicator
          forceMount
          data-slot="checkbox-indicator"
          className="grid place-content-center text-current [&>svg]:size-3.5"
        >
          <AnimatePresence initial={false}>
            {resolvedChecked ? (
              <m.span
                key="check"
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.65 }}
                initial={{ opacity: 0, scale: 0.65 }}
                transition={motionSpring.press}
              >
                <CheckIcon />
              </m.span>
            ) : null}
          </AnimatePresence>
        </CheckboxPrimitive.Indicator>
      </MotionCheckboxRoot>
    </PressMotionBoundary>
  );
}

export { Checkbox };
