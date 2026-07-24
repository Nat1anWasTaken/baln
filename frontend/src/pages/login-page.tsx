import { Landmark, LogIn } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/auth-context";
import { AppLoading } from "@/components/app-loading";
import { CenteredCardHeader } from "@/components/centered-card-header";
import { CenteredPage } from "@/components/centered-page";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { API_BASE_URL } from "@/lib/api-client";

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") {
    return <AppLoading label="正在確認登入狀態" />;
  }

  if (auth.status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  const intendedPath =
    (location.state as { from?: string } | null)?.from ?? "/";

  function startLogin() {
    sessionStorage.setItem("baln:return-to", intendedPath);
    window.location.assign(`${API_BASE_URL}/auth/google/start`);
  }

  return (
    <CenteredPage className="relative">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CenteredCardHeader
          icon={<Landmark className="size-6" aria-hidden="true" />}
          title="登入 Baln"
          description="使用已授權的 Google 帳號管理你的個人帳務。"
        />
        <CardContent>
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={startLogin}
          >
            <LogIn aria-hidden="true" />
            使用 Google 登入
          </Button>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            只有管理員預先建立並啟用的使用者可以登入。
          </p>
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
