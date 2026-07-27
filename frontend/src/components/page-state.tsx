import type { LucideIcon } from "lucide-react";
import { CircleAlert, Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { CenteredCardHeader } from "@/components/centered-card-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function InsightsLoading({ stacked = false }: { stacked?: boolean }) {
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
              <Skeleton className="mt-2 h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className={stacked ? "grid gap-4" : "grid gap-4 lg:grid-cols-2"}>
        {Array.from({ length: 2 }).map((_, index) => (
          <CardLoading key={index} rows={stacked ? 4 : 3} announce={false} />
        ))}
      </div>
    </div>
  );
}

export function CardLoading({
  rows = 3,
  announce = true,
}: {
  rows?: number;
  announce?: boolean;
}) {
  return (
    <Card
      role={announce ? "status" : undefined}
      aria-label={announce ? "載入中" : undefined}
      aria-busy={announce || undefined}
      aria-hidden={announce ? undefined : true}
    >
      <CardHeader>
        <Skeleton className="h-5 w-24" aria-hidden="true" />
        <Skeleton className="h-4 w-44 max-w-full" aria-hidden="true" />
      </CardHeader>
      <CardContent className="grid gap-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="grid gap-2 rounded-lg border p-3">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-24" aria-hidden="true" />
              <Skeleton className="h-4 w-20" aria-hidden="true" />
            </div>
            <Skeleton className="h-1.5 w-full" aria-hidden="true" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function PageLoading({
  rows = 4,
  variant = "list",
}: {
  rows?: number;
  variant?: "list" | "dashboard" | "reports";
}) {
  return (
    <div
      className={variant === "list" ? "grid gap-3" : undefined}
      role="status"
      aria-label="載入中"
      aria-busy="true"
      data-loading-variant={variant}
    >
      {variant === "dashboard" || variant === "reports" ? (
        <InsightsLoading stacked={variant === "reports"} />
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

export function InlineErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <span>{message}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        重新載入
      </Button>
    </div>
  );
}
