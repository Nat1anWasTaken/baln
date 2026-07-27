import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import { useAppNavigate } from "@/components/navigation-transition";
import {
  authApi,
  refreshAccessToken,
  setAccessToken,
  setSessionExpiredHandler,
} from "@/lib/api-client";
import type { User } from "@/lib/schemas";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  completeLogin: (code: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    window.location.pathname === "/auth/callback"
      ? "unauthenticated"
      : "loading",
  );
  const [user, setUser] = useState<User | null>(null);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useAppNavigate();
  const initialPath = useState(() => location.pathname)[0];

  const clearSession = useCallback(() => {
    setAccessToken(null);
    queryClient.clear();
    setUser(null);
    setStatus("unauthenticated");
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearSession();
      if (window.location.pathname !== "/login") {
        navigate("/login", { replace: true, transitionIntent: "none" });
      }
    });
    return () => setSessionExpiredHandler(null);
  }, [clearSession, navigate]);

  useEffect(() => {
    let active = true;

    if (initialPath === "/auth/callback") {
      return () => {
        active = false;
      };
    }

    void refreshAccessToken()
      .then(() => authApi.me())
      .then((currentUser) => {
        if (!active) return;
        setUser(currentUser);
        setStatus("authenticated");
      })
      .catch(() => {
        if (active) clearSession();
      });

    return () => {
      active = false;
    };
  }, [clearSession, initialPath]);

  const completeLogin = useCallback(async (code: string) => {
    setStatus("loading");
    await authApi.exchangeCode(code);
    const currentUser = await authApi.me();
    setUser(currentUser);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({ status, user, completeLogin, logout }),
    [completeLogin, logout, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
