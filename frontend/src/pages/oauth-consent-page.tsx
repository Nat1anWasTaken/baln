import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, CircleAlert, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { AppLoading } from "@/components/app-loading";
import { CenteredCardHeader } from "@/components/centered-card-header";
import { CenteredPage } from "@/components/centered-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { oauthApi } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

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
    queryKey: queryKeys.oauthConsent(requestId ?? ""),
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
    <CenteredPage>
      <Card className="w-full max-w-lg">
        <CenteredCardHeader
          icon={<Bot className="size-6" aria-hidden="true" />}
          title={`允許 ${consent.data.client_name} 連接 Baln？`}
          description="核准後，這個應用程式能依照下列權限存取你的個人帳務。"
        />
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
            loading={decision.isPending && decision.variables === false}
            onClick={() => decision.mutate(false)}
          >
            拒絕
          </Button>
          <Button
            type="button"
            disabled={decision.isPending}
            loading={decision.isPending && decision.variables === true}
            onClick={() => decision.mutate(true)}
          >
            允許連線
          </Button>
        </CardFooter>
      </Card>
    </CenteredPage>
  );
}

function ConsentError({ message }: { message: string }) {
  return (
    <CenteredPage>
      <Card className="w-full max-w-md">
        <CenteredCardHeader
          icon={<CircleAlert className="size-6" aria-hidden="true" />}
          iconTone="destructive"
          title="無法完成連線"
          description={message}
        />
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            請返回 ChatGPT，重新連接 Baln，並再次核准權限。
          </p>
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
