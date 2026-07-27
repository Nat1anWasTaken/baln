import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { AppLoading } from "@/components/app-loading";
import { CenteredPage } from "@/components/centered-page";
import { OfflineUnavailableState } from "@/components/offline-state";
import { useAuth } from "@/auth/auth-context";

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") {
    return <AppLoading label="正在確認登入狀態" />;
  }

  if (auth.status === "connection-required") {
    return (
      <CenteredPage>
        <div className="w-full max-w-sm">
          <OfflineUnavailableState
            title="需要連線才能開啟 Baln"
            description="這台裝置沒有可用的離線工作階段。請連線後重新嘗試。"
          />
        </div>
      </CenteredPage>
    );
  }

  if (
    auth.status !== "authenticated" &&
    auth.status !== "offline-authenticated"
  ) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}

export function OnlineOnly({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (!auth.isReadOnly) return children;
  return (
    <OfflineUnavailableState
      title="此功能需要網路連線"
      description="離線模式僅供檢視。重新連線後即可進行變更或管理安全設定。"
    />
  );
}
