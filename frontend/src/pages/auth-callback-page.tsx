import { CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/auth/auth-context";
import { CenteredCardHeader } from "@/components/centered-card-header";
import { CenteredPage } from "@/components/centered-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AuthCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const started = useRef(false);
  const [error, setError] = useState<string | null>(
    code ? null : "登入回傳內容缺少授權碼，請重新登入。",
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!code) {
      return;
    }

    void auth
      .completeLogin(code)
      .then(() => {
        const returnTo = sessionStorage.getItem("baln:return-to") ?? "/";
        sessionStorage.removeItem("baln:return-to");
        navigate(returnTo, { replace: true });
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : "登入失敗，請重新嘗試。",
        );
      });
  }, [auth, code, navigate]);

  return (
    <CenteredPage>
      <Card className="w-full max-w-sm">
        <CenteredCardHeader
          icon={
            error ? (
              <CircleAlert className="size-6" aria-hidden="true" />
            ) : (
              <LoaderCircle
                className="size-6 animate-spin"
                aria-hidden="true"
              />
            )
          }
          iconTone={error ? "destructive" : "muted"}
          title={error ? "登入失敗" : "正在完成登入"}
          description={error ?? "正在安全地建立你的登入狀態，請稍候。"}
        />
        {error ? (
          <CardContent>
            <Button
              type="button"
              className="w-full"
              onClick={() => navigate("/login", { replace: true })}
            >
              返回登入
            </Button>
          </CardContent>
        ) : null}
      </Card>
    </CenteredPage>
  );
}
