import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { m } from "motion/react";
import { Tabs as TabsPrimitive } from "radix-ui";

import {
  motionSpring,
  type MotionSafeProps,
  PressMotionBoundary,
  useOwnedPressMotionProps,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

const MotionTabsTrigger = m.create(TabsPrimitive.Trigger);
const TabsMotionContext = React.createContext({
  layoutId: "tabs-active",
  value: "",
});

function Tabs({
  className,
  children,
  defaultValue,
  orientation = "horizontal",
  onValueChange,
  value,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const reactId = React.useId();
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const resolvedValue = value ?? internalValue;
  return (
    <TabsMotionContext.Provider
      value={{ layoutId: `tabs-active-${reactId}`, value: resolvedValue }}
    >
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        className={cn(
          "group/tabs flex gap-2 data-horizontal:flex-col",
          className,
        )}
        defaultValue={defaultValue}
        onValueChange={(nextValue) => {
          setInternalValue(nextValue);
          onValueChange?.(nextValue);
        }}
        orientation={orientation}
        value={value}
        {...props}
      >
        {children}
      </TabsPrimitive.Root>
    </TabsMotionContext.Provider>
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-full p-1 text-muted-foreground group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:rounded-2xl data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  children,
  disabled,
  value,
  ...props
}: MotionSafeProps<React.ComponentProps<typeof TabsPrimitive.Trigger>>) {
  const motion = React.useContext(TabsMotionContext);
  const active = motion.value === value;
  const pressMotion = useOwnedPressMotionProps("control", disabled);
  return (
    <PressMotionBoundary>
      <MotionTabsTrigger
        data-slot="tabs-trigger"
        disabled={disabled}
        value={value}
        className={cn(
          "focus-ring relative isolate inline-flex h-[calc(100%-1px)] flex-1 touch-manipulation items-center justify-center gap-2 rounded-full border border-transparent! px-3 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start group-data-vertical/tabs:rounded-2xl group-data-vertical/tabs:px-3 group-data-vertical/tabs:py-1.5 hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
          "data-active:text-foreground dark:data-active:border-input dark:data-active:text-foreground",
          className,
        )}
        {...pressMotion}
        {...props}
      >
        {active ? (
          <m.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-background shadow-sm dark:bg-input/30 group-data-[variant=line]/tabs-list:inset-x-0 group-data-[variant=line]/tabs-list:top-auto group-data-[variant=line]/tabs-list:bottom-[-5px] group-data-[variant=line]/tabs-list:h-0.5 group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:bg-foreground group-data-[variant=line]/tabs-list:shadow-none"
            layoutId={motion.layoutId}
            transition={motionSpring.layout}
          />
        ) : null}
        {children}
      </MotionTabsTrigger>
    </PressMotionBoundary>
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
