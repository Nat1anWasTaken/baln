import type { LucideIcon } from "lucide-react";
import { CircleAlert, Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { CenteredCardHeader } from "@/components/centered-card-header";
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
    <Card className="border-destructive/30">
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
