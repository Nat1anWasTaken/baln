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
  ApiError,
  NetworkError,
  authApi,
  refreshAccessToken,
  setAccessToken,
  setSessionExpiredHandler,
} from "@/lib/api-client";
import {
  BALN_OFFLINE_EVENT,
  BALN_ONLINE_EVENT,
  pauseNetworkQueries,
  resumeNetworkQueries,
} from "@/lib/connectivity";
import {
  clearOfflineData,
  hasPendingLogout,
  readOfflineSession,
  saveOfflineSession,
  setPendingLogout,
} from "@/lib/offline-storage";
import type { User } from "@/lib/schemas";
import { completeStartupTask } from "@/lib/startup-progress";

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "offline-authenticated"
  | "unauthenticated"
  | "connection-required";

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  isReadOnly: boolean;
  lastValidatedAt: number | null;
  completeLogin: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  retryConnection: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    window.location.pathname === "/auth/callback"
      ? "unauthenticated"
      : "loading",
  );
  const [user, setUser] = useState<User | null>(null);
  const [lastValidatedAt, setLastValidatedAt] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useAppNavigate();
  const initialPath = useState(() => location.pathname)[0];

  const clearSession = useCallback(async () => {
    setAccessToken(null);
    queryClient.clear();
    setUser(null);
    setLastValidatedAt(null);
    setStatus("unauthenticated");
    await clearOfflineData();
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      void clearSession();
      if (window.location.pathname !== "/login") {
        navigate("/login", { replace: true, transitionIntent: "none" });
      }
    });
    return () => setSessionExpiredHandler(null);
  }, [clearSession, navigate]);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      if (await hasPendingLogout()) {
        try {
          await authApi.logout();
          await setPendingLogout(false);
          if (!active) return;
          await clearSession();
          completeStartupTask("session", "請登入以繼續");
        } catch (error) {
          if (!active) return;
          if (error instanceof ApiError && error.status === 401) {
            await setPendingLogout(false);
            await clearSession();
            completeStartupTask("session", "請登入以繼續");
            return;
          }
          pauseNetworkQueries();
          setStatus("connection-required");
          completeStartupTask("session", "需要連線才能完成登出");
        }
        return;
      }

      const cachedSession = await readOfflineSession().catch(() => null);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);

      try {
        await refreshAccessToken(controller.signal);
        const currentUser = await authApi.me(controller.signal);
        if (!active) return;

        if (cachedSession && cachedSession.user.id !== currentUser.id) {
          queryClient.clear();
          await clearOfflineData();
        }

        const saved = await saveOfflineSession(currentUser).catch(() => null);
        resumeNetworkQueries();
        setUser(currentUser);
        setLastValidatedAt(saved?.validatedAt ?? Date.now());
        setStatus("authenticated");
        completeStartupTask("session", "正在開啟帳務空間");
      } catch (error) {
        if (!active) return;

        const confirmedUnauthorized =
          error instanceof ApiError && error.status === 401;
        if (confirmedUnauthorized) {
          await clearSession();
          completeStartupTask("session", "請登入以繼續");
          return;
        }

        const canUseCachedSession =
          cachedSession &&
          (error instanceof NetworkError ||
            (error instanceof ApiError && error.status >= 500) ||
            (error instanceof DOMException && error.name === "AbortError"));

        pauseNetworkQueries();
        if (canUseCachedSession) {
          setUser(cachedSession.user);
          setLastValidatedAt(cachedSession.validatedAt);
          setStatus("offline-authenticated");
          completeStartupTask("session", "目前離線，正在開啟上次資料");
        } else {
          setStatus("connection-required");
          completeStartupTask("session", "需要連線才能開啟 Baln");
        }
      } finally {
        window.clearTimeout(timeout);
      }
    };

    if (initialPath === "/auth/callback") {
      completeStartupTask("session", "正在完成登入");
      return () => {
        active = false;
      };
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, [clearSession, initialPath, queryClient]);

  const completeLogin = useCallback(async (code: string) => {
    setStatus("loading");
    await authApi.exchangeCode(code);
    const currentUser = await authApi.me();
    const saved = await saveOfflineSession(currentUser).catch(() => null);
    resumeNetworkQueries();
    setUser(currentUser);
    setLastValidatedAt(saved?.validatedAt ?? Date.now());
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    const offline = !navigator.onLine || status === "offline-authenticated";
    if (offline) {
      await setPendingLogout(true);
      await clearSession();
      return;
    }

    try {
      await authApi.logout();
      await setPendingLogout(false);
    } catch (error) {
      await setPendingLogout(
        !(error instanceof ApiError && error.status === 401),
      );
    }
    await clearSession();
  }, [clearSession, status]);

  const retryConnection = useCallback(async () => {
    if (!navigator.onLine) {
      pauseNetworkQueries();
      return;
    }

    setStatus("loading");
    try {
      if (await hasPendingLogout()) {
        try {
          await authApi.logout();
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 401)) {
            throw error;
          }
        }
        await setPendingLogout(false);
        await clearSession();
        resumeNetworkQueries();
        return;
      }

      await refreshAccessToken();
      const currentUser = await authApi.me();
      const saved = await saveOfflineSession(currentUser).catch(() => null);
      resumeNetworkQueries();
      setUser(currentUser);
      setLastValidatedAt(saved?.validatedAt ?? Date.now());
      setStatus("authenticated");
      await queryClient.refetchQueries({ type: "active" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearSession();
        navigate("/login", { replace: true, transitionIntent: "none" });
        return;
      }
      pauseNetworkQueries();
      setStatus(user ? "offline-authenticated" : "connection-required");
    }
  }, [clearSession, navigate, queryClient, user]);

  useEffect(() => {
    const handleOffline = () => {
      pauseNetworkQueries();
      if (user) setStatus("offline-authenticated");
    };
    const handleOnline = () => {
      void retryConnection();
    };

    window.addEventListener(BALN_OFFLINE_EVENT, handleOffline);
    window.addEventListener(BALN_ONLINE_EVENT, handleOnline);
    return () => {
      window.removeEventListener(BALN_OFFLINE_EVENT, handleOffline);
      window.removeEventListener(BALN_ONLINE_EVENT, handleOnline);
    };
  }, [retryConnection, user]);

  const value = useMemo(
    () => ({
      status,
      user,
      isReadOnly: status === "offline-authenticated",
      lastValidatedAt,
      completeLogin,
      logout,
      retryConnection,
    }),
    [completeLogin, lastValidatedAt, logout, retryConnection, status, user],
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

export function useOfflineReadOnly() {
  return useContext(AuthContext)?.isReadOnly ?? false;
}
