import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy, Unplug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, PageLoading } from "@/components/page-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { API_BASE_URL, oauthApi } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/format";
import type { ConnectedApp } from "@/lib/schemas";

const scopeLabels: Record<string, string> = {
  "ledger:read": "讀取帳務",
  "ledger:write": "建立與修改",
  "ledger:delete": "刪除交易",
  offline_access: "離線存取",
};

function getMcpUrl() {
  return new URL(
    "../../mcp",
    new URL(`${API_BASE_URL}/`, window.location.origin),
  ).toString();
}

export function ConnectedAppsPage() {
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<ConnectedApp | null>(null);

  async function copyMcpUrl() {
    try {
      await navigator.clipboard.writeText(getMcpUrl());
      toast.success("MCP URL 已複製");
    } catch {
      toast.error("無法複製，請手動取得 MCP URL。");
    }
  }

  const apps = useQuery({
    queryKey: ["connected-apps"],
    queryFn: oauthApi.connectedApps,
  });
  const revoke = useMutation({
    mutationFn: (app: ConnectedApp) => oauthApi.revokeConnectedApp(app.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["connected-apps"] });
      toast.success("已撤銷應用程式的存取權");
      setRevoking(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const content = apps.isPending ? (
    <PageLoading rows={3} />
  ) : apps.isError ? (
    <ErrorState
      message={apps.error.message}
      onRetry={() => void apps.refetch()}
    />
  ) : apps.data.length === 0 ? (
    <EmptyState
      icon={Bot}
      title="沒有已連接的應用程式"
      description="透過 OAuth 連接 ChatGPT 或其他 MCP 用戶端後，會顯示在這裡。"
    />
  ) : (
    <div className="grid gap-3">
      {apps.data.map((app) => (
        <Card key={app.id}>
          <CardHeader>
            <CardTitle>{app.client_name}</CardTitle>
            <CardDescription>
              連接於 {formatTimestamp(app.created_at)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {app.scopes.map((scope) => (
                <Badge key={scope} variant="secondary">
                  {scopeLabels[scope] ?? scope}
                </Badge>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRevoking(app)}
            >
              <Unplug aria-hidden="true" />
              撤銷連線
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">
            已連接的應用程式
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            管理透過 OAuth 存取 Baln 的 ChatGPT 與 MCP 用戶端。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void copyMcpUrl()}
        >
          <Copy aria-hidden="true" />
          複製 MCP URL
        </Button>
      </div>
      {content}
      <AlertDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              撤銷「{revoking?.client_name}」的連線？
            </AlertDialogTitle>
            <AlertDialogDescription>
              所有相關存取權杖將立即失效。若要再次使用，必須重新連接並核准權限。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={revoke.isPending}
              onClick={() => revoking && revoke.mutate(revoking)}
            >
              撤銷連線
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
