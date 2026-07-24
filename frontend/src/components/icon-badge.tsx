import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const toneClasses = {
  primary: "bg-primary text-primary-foreground",
  muted: "bg-muted text-muted-foreground",
  destructive: "bg-destructive/10 text-destructive",
} as const;

type IconBadgeProps = ComponentProps<"div"> & {
  tone?: keyof typeof toneClasses;
};

export function IconBadge({
  className,
  tone = "primary",
  ...props
}: IconBadgeProps) {
  return (
    <div
      className={cn(
        "flex size-12 items-center justify-center rounded-xl",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
