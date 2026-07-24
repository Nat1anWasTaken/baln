import { Navigate, Outlet, useLocation } from "react-router-dom";

import { AppLoading } from "@/components/app-loading";
import { useAuth } from "@/auth/auth-context";

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") {
    return <AppLoading label="正在確認登入狀態" />;
  }

  if (auth.status !== "authenticated") {
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
