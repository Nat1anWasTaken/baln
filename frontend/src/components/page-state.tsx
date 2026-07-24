import type { LucideIcon } from "lucide-react";
import { CircleAlert, Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { CenteredCardHeader } from "@/components/centered-card-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardLoading() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} aria-hidden="true">
            <CardHeader className="flex-row items-center justify-between pb-1">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="size-4 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} aria-hidden="true">
            <CardHeader>
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-40 max-w-full" />
            </CardHeader>
            <CardContent className="grid gap-3 py-2">
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid grid-cols-[4rem_1fr] items-center gap-3"
                >
                  <Skeleton className="h-4 w-full" />
                  <Skeleton
                    className={
                      rowIndex === 0
                        ? "h-5 w-full"
                        : rowIndex === 1
                          ? "h-5 w-4/5"
                          : "h-5 w-3/5"
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function PageLoading({
  rows = 4,
  variant = "list",
}: {
  rows?: number;
  variant?: "list" | "dashboard";
}) {
  return (
    <div
      className={variant === "list" ? "grid gap-3" : undefined}
      role="status"
      aria-label="載入中"
      aria-busy="true"
      data-loading-variant={variant}
    >
      {variant === "dashboard" ? (
        <DashboardLoading />
      ) : (
        Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" aria-hidden="true" />
        ))
      )}
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
    <Card
      className="border border-dashed border-foreground/20 bg-muted/20 ring-0"
      data-state="empty"
    >
      <CenteredCardHeader
        icon={<Icon className="size-6" aria-hidden="true" />}
        iconTone="muted"
        title={title}
        description={description}
      />
      {action ? (
        <CardContent className="flex justify-center">{action}</CardContent>
      ) : null}
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
    <Card
      className="bg-destructive/5 ring-destructive/30"
      data-state="error"
      role="alert"
    >
      <CenteredCardHeader
        icon={<CircleAlert className="size-6" aria-hidden="true" />}
        iconTone="destructive"
        title="無法載入資料"
        description={message ?? "資料載入失敗，請稍後再試。"}
      />
      {onRetry ? (
        <CardContent className="flex justify-center">
          <Button type="button" variant="outline" onClick={onRetry}>
            重新載入
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
