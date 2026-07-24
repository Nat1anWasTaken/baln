import type { LucideIcon } from "lucide-react";
import { CircleAlert, Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PageLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-label="載入中">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-20 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="grid gap-1">
          <h2 className="font-medium">{title}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <CircleAlert className="size-6 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {message ?? "資料載入失敗，請稍後再試。"}
        </p>
        {onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            重新載入
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
