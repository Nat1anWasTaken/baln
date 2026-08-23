import * as React from "react";
import { m } from "motion/react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { FieldLabel } from "@/components/ui/field";
import {
  motionSpring,
  type MotionSafeProps,
  PressMotionBoundary,
  useOwnedPressMotionProps,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

const MotionSwitchRoot = m.create(SwitchPrimitive.Root);
const MotionSwitchThumb = m.create(SwitchPrimitive.Thumb);

function Switch({
  className,
  checked,
  defaultChecked,
  disabled,
  onCheckedChange,
  size = "default",
  ...props
}: MotionSafeProps<React.ComponentProps<typeof SwitchPrimitive.Root>> & {
  size?: "sm" | "default";
}) {
  const [internalChecked, setInternalChecked] = React.useState(
    defaultChecked ?? false,
  );
  const resolvedChecked = checked ?? internalChecked;
  const pressMotion = useOwnedPressMotionProps("control", disabled);
  return (
    <PressMotionBoundary>
      <MotionSwitchRoot
        data-slot="switch"
        data-size={size}
        checked={resolvedChecked}
        disabled={disabled}
        onCheckedChange={(nextChecked) => {
          setInternalChecked(nextChecked);
          onCheckedChange?.(nextChecked);
        }}
        className={cn(
          "focus-ring peer group/switch relative inline-flex shrink-0 items-center rounded-full border-2 outline-none group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-5 data-[size=default]:w-11 data-[size=sm]:h-4 data-[size=sm]:w-7 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary group-has-[:focus-visible]/field-label:data-checked:border-primary data-unchecked:border-transparent data-unchecked:bg-input/90 group-has-[:focus-visible]/field-label:data-unchecked:border-transparent data-disabled:cursor-not-allowed data-disabled:opacity-50",
          className,
        )}
        {...pressMotion}
        {...props}
      >
        <MotionSwitchThumb
          data-slot="switch-thumb"
          animate={{ x: resolvedChecked ? (size === "default" ? 16 : 8) : 0 }}
          className="pointer-events-none block rounded-full bg-background shadow-sm ring-0 not-dark:bg-clip-padding group-data-[size=default]/switch:h-4 group-data-[size=default]/switch:w-6 group-data-[size=sm]/switch:h-3 group-data-[size=sm]/switch:w-4 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground"
          initial={false}
          transition={motionSpring.layout}
        />
      </MotionSwitchRoot>
    </PressMotionBoundary>
  );
}

function SwitchField({
  id,
  label,
  containerClassName,
  ...props
}: Omit<React.ComponentProps<typeof Switch>, "id"> & {
  id: string;
  label: React.ReactNode;
  containerClassName?: string;
}) {
  return (
    <FieldLabel
      htmlFor={id}
      className={cn(
        "min-h-11 cursor-pointer items-center gap-3 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50",
        containerClassName,
      )}
    >
      <Switch id={id} {...props} />
      <span>{label}</span>
    </FieldLabel>
  );
}

export { Switch, SwitchField };
