import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
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
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { API_BASE_URL, apiTokensApi } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/format";
import type { ApiToken, CreatedApiToken } from "@/lib/schemas";

type ExpirationChoice = "30" | "90" | "365" | "never";

function expirationTimestamp(choice: ExpirationChoice) {
  if (choice === "never") return null;
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + Number(choice));
  return expiresAt.toISOString();
}

function getOpenApiJsonUrl() {
  return new URL(
    "../openapi.json",
    new URL(`${API_BASE_URL}/`, window.location.origin),
  ).toString();
}

function TokenDates({ token }: { token: ApiToken }) {
  return (
    <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
      <div>
        <dt className="inline">建立：</dt>
        <dd className="inline">{formatTimestamp(token.created_at)}</dd>
      </div>
      <div>
        <dt className="inline">最後使用：</dt>
        <dd className="inline">
          {token.last_used_at
            ? formatTimestamp(token.last_used_at)
            : "尚未使用"}
        </dd>
      </div>
      <div>
        <dt className="inline">到期：</dt>
        <dd className="inline">
          {token.expires_at ? formatTimestamp(token.expires_at) : "永不"}
        </dd>
      </div>
    </dl>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (token: CreatedApiToken) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [expiration, setExpiration] = useState<ExpirationChoice>("90");
  const [submitted, setSubmitted] = useState(false);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setName("");
      setExpiration("90");
      setSubmitted(false);
    }
    onOpenChange(nextOpen);
  }

  const create = useMutation({
    mutationFn: () =>
      apiTokensApi.create({
        name: name.trim(),
        expires_at: expirationTimestamp(expiration),
      }),
    onSuccess: async (token) => {
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
      changeOpen(false);
      onCreated(token);
    },
    onError: (error) => toast.error(error.message),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!name.trim() || name.trim().length > 100) return;
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>建立 API 權杖</DialogTitle>
            <DialogDescription>
              權杖可完整存取你的帳戶、交易與報表。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <Field
              data-invalid={
                submitted && (!name.trim() || name.trim().length > 100)
              }
            >
              <FieldLabel htmlFor="api-token-name">名稱</FieldLabel>
              <Input
                id="api-token-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：記帳自動化"
                maxLength={100}
                aria-invalid={
                  submitted && (!name.trim() || name.trim().length > 100)
                }
              />
              <FieldDescription>用來辨識使用這個權杖的程式。</FieldDescription>
              {submitted && !name.trim() ? (
                <FieldError>請輸入權杖名稱。</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="api-token-expiration">有效期限</FieldLabel>
              <Combobox
                id="api-token-expiration"
                value={expiration}
                onValueChange={(value) =>
                  setExpiration(value as ExpirationChoice)
                }
                options={[
                  { value: "30", label: "30 天" },
                  { value: "90", label: "90 天" },
                  { value: "365", label: "365 天" },
                  { value: "never", label: "永不到期" },
                ]}
                searchPlaceholder="搜尋有效期限…"
                emptyText="找不到有效期限。"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => changeOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" loading={create.isPending}>
              建立權杖
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TokenSecretDialog({
  token,
  onClose,
}: {
  token: CreatedApiToken | null;
  onClose: () => void;
}) {
  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token.token);
      toast.success("權杖已複製");
    } catch {
      toast.error("無法複製，請手動選取權杖。");
    }
  }

  return (
    <Dialog open={token !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>立即複製你的權杖</DialogTitle>
          <DialogDescription>
            這是唯一一次顯示完整權杖。關閉後將無法再次查看。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          <code className="max-h-32 overflow-auto rounded-lg bg-muted p-3 text-xs break-all select-all">
            {token?.token}
          </code>
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyToken()}
          >
            <Copy aria-hidden="true" />
            複製權杖
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            我已儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApiTokensPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<CreatedApiToken | null>(
    null,
  );
  const [revoking, setRevoking] = useState<ApiToken | null>(null);

  async function copyOpenApiJsonUrl() {
    try {
      await navigator.clipboard.writeText(getOpenApiJsonUrl());
      toast.success("OpenAPI JSON URL 已複製");
    } catch {
      toast.error("無法複製，請手動取得 OpenAPI JSON URL。");
    }
  }

  const tokens = useQuery({
    queryKey: ["api-tokens"],
    queryFn: apiTokensApi.list,
  });

  const revoke = useMutation({
    mutationFn: (token: ApiToken) => apiTokensApi.revoke(token.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
      toast.success("API 權杖已撤銷");
      setRevoking(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const content = tokens.isPending ? (
    <PageLoading rows={3} />
  ) : tokens.isError ? (
    <ErrorState
      message={tokens.error.message}
      onRetry={() => void tokens.refetch()}
    />
  ) : tokens.data.length === 0 ? (
    <EmptyState
      icon={KeyRound}
      title="還沒有 API 權杖"
      description="建立權杖後，就能從腳本或其他應用程式存取你的 Baln 資料。"
      action={
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          建立第一個權杖
        </Button>
      }
    />
  ) : (
    <div className="grid gap-3">
      {tokens.data.map((token) => (
        <Card key={token.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="truncate">{token.name}</CardTitle>
                <CardDescription className="font-mono">
                  {token.token_hint}
                </CardDescription>
              </div>
              <Badge
                variant={token.status === "active" ? "secondary" : "outline"}
              >
                {token.status === "active" ? "有效" : "已到期"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <TokenDates token={token} />
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRevoking(token)}
              >
                <Trash2 aria-hidden="true" />
                撤銷
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">個人 API 權杖</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            使用 Bearer 權杖從外部工具存取現有的 API。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyOpenApiJsonUrl()}
          >
            <Copy aria-hidden="true" />
            複製 OpenAPI JSON URL
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            建立權杖
          </Button>
        </div>
      </div>

      {content}

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setCreatedToken}
      />
      <TokenSecretDialog
        token={createdToken}
        onClose={() => setCreatedToken(null)}
      />
      <AlertDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤銷「{revoking?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              使用這個權杖的程式將立即失去 API 存取權，且無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={revoke.isPending}
              onClick={() => revoking && revoke.mutate(revoking)}
            >
              撤銷權杖
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
