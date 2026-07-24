import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, CircleAlert, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { AppLoading } from "@/components/app-loading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { oauthApi } from "@/lib/api-client";

const scopeLabels: Record<string, string> = {
  "ledger:read": "查看帳戶、交易、餘額與報表",
  "ledger:write": "建立及修改帳戶與交易",
  "ledger:delete": "刪除交易",
  offline_access: "在你離線時持續連線",
};

export function OAuthConsentPage() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get("request_id");
  const consent = useQuery({
    queryKey: ["oauth-consent", requestId],
    queryFn: () => oauthApi.consentDetails(requestId!),
    enabled: Boolean(requestId),
    retry: false,
  });
  const decision = useMutation({
    mutationFn: (approve: boolean) =>
      oauthApi.decideConsent(requestId!, approve),
    onSuccess: (result) => window.location.assign(result.redirect_url),
  });

  if (!requestId) {
    return (
      <ConsentError message="授權連結缺少請求識別碼。請返回 ChatGPT 並重新連接 Baln。" />
    );
  }
  if (consent.isPending) {
    return <AppLoading label="正在載入連線權限" />;
  }
  if (consent.isError) {
    return <ConsentError message={consent.error.message} />;
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bot className="size-6" aria-hidden="true" />
          </div>
          <CardTitle>允許 {consent.data.client_name} 連接 Baln？</CardTitle>
          <CardDescription>
            核准後，這個應用程式能依照下列權限存取你的個人帳務。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3">
            {consent.data.scopes.map((scope) => (
              <li
                key={scope}
                className="flex items-start gap-3 rounded-lg border p-3 text-sm"
              >
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span>{scopeLabels[scope] ?? scope}</span>
              </li>
            ))}
          </ul>
          {decision.isError ? (
            <p className="mt-4 text-sm text-destructive">
              {decision.error.message}
            </p>
          ) : null}
          <p className="mt-4 text-xs text-muted-foreground">
            你之後可以從「已連接的應用程式」立即撤銷存取權。
          </p>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={decision.isPending}
            onClick={() => decision.mutate(false)}
          >
            拒絕
          </Button>
          <Button
            type="button"
            disabled={decision.isPending}
            onClick={() => decision.mutate(true)}
          >
            {decision.isPending ? "處理中" : "允許連線"}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

function ConsentError({ message }: { message: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CircleAlert className="size-8 text-destructive" aria-hidden="true" />
          <CardTitle>無法完成連線</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            請返回 ChatGPT，重新連接 Baln，並再次核准權限。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
