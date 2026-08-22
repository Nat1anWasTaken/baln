import * as React from "react";
import { m } from "motion/react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { motionSpring } from "@/lib/motion";
import { cn } from "@/lib/utils";

const MotionProgressIndicator = m.create(ProgressPrimitive.Indicator);

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
}) {
  const normalized = Math.min(100, Math.max(0, value ?? 0));
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-3 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className,
      )}
      value={normalized}
      {...props}
    >
      <MotionProgressIndicator
        data-slot="progress-indicator"
        className={cn(
          "size-full flex-1 origin-left bg-primary",
          indicatorClassName,
        )}
        animate={{ scaleX: normalized / 100 }}
        initial={false}
        transition={motionSpring.layout}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
