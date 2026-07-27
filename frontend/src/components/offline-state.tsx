import { CloudOff, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { useAuth } from "@/auth/auth-context";
import { CenteredCardHeader } from "@/components/centered-card-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isPersistedQueryKey } from "@/lib/offline-storage";

function formatLastSync(value: number | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function OfflineBanner() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const lastQuerySync = useSyncExternalStore(
    (listener) => queryClient.getQueryCache().subscribe(listener),
    () =>
      queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => isPersistedQueryKey(query.queryKey))
        .reduce(
          (latest, query) => Math.max(latest, query.state.dataUpdatedAt),
          0,
        ),
    () => 0,
  );
  if (!auth.isReadOnly) return null;
  const lastSync = formatLastSync(
    Math.max(lastQuerySync, auth.lastValidatedAt ?? 0),
  );

  return (
    <div
      className="flex flex-col gap-2 border-b bg-muted/70 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
      role="status"
    >
      <span className="flex items-center gap-2">
        <CloudOff className="size-4 shrink-0" aria-hidden="true" />
        離線模式・顯示上次同步的資料
        {lastSync ? `（${lastSync}）` : null}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void auth.retryConnection()}
      >
        <RefreshCw aria-hidden="true" />
        重新連線
      </Button>
    </div>
  );
}

export function OfflineUnavailableState({
  title = "此資料尚未儲存在這台裝置",
  description = "連線後開啟一次，即可在短暫離線時檢視上次同步的內容。",
}: {
  title?: string;
  description?: string;
}) {
  const auth = useAuth();
  return (
    <Card
      className="border border-dashed border-foreground/20 bg-muted/20 ring-0"
      role="status"
    >
      <CenteredCardHeader
        icon={<CloudOff className="size-6" aria-hidden="true" />}
        iconTone="muted"
        title={title}
        description={description}
      />
      <CardContent className="flex justify-center">
        <Button
          type="button"
          variant="outline"
          onClick={() => void auth.retryConnection()}
        >
          <RefreshCw aria-hidden="true" />
          重新連線
        </Button>
      </CardContent>
    </Card>
  );
}
