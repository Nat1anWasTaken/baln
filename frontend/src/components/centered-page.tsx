import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function CenteredPage({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "flex min-h-svh items-center justify-center bg-muted/30 p-4",
        className,
      )}
      {...props}
    />
  );
}
