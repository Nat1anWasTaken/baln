import type { ComponentProps, ReactNode } from "react";

import { IconBadge } from "@/components/icon-badge";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CenteredCardHeaderProps = Omit<
  ComponentProps<typeof CardHeader>,
  "children"
> & {
  icon: ReactNode;
  iconTone?: ComponentProps<typeof IconBadge>["tone"];
  title: ReactNode;
  description: ReactNode;
};

export function CenteredCardHeader({
  className,
  icon,
  iconTone = "primary",
  title,
  description,
  ...props
}: CenteredCardHeaderProps) {
  return (
    <CardHeader
      className={cn("items-center justify-items-center text-center", className)}
      {...props}
    >
      <IconBadge className="mb-2" tone={iconTone}>
        {icon}
      </IconBadge>
      <CardTitle className="text-xl">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );
}
