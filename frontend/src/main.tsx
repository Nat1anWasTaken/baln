import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import App from "@/App";
import { AuthProvider } from "@/auth/auth-context";
import { NavigationTransitionProvider } from "@/components/navigation-transition";
import { PwaUpdateProvider } from "@/components/pwa-update-prompt";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { configureConnectivityEvents } from "@/lib/connectivity";
import "@/lib/install-prompt";
import {
  OFFLINE_CACHE_BUSTER,
  OFFLINE_MAX_AGE,
  offlinePersister,
  shouldPersistQuery,
} from "@/lib/offline-storage";
import { queryClient } from "@/lib/query-client";
import { preloadAppRoute } from "@/lib/route-modules";
import { completeStartupTask, failStartup } from "@/lib/startup-progress";
import "@/index.css";

// A production preview can leave its PWA worker attached to localhost. Clear it
// in development so it cannot keep serving an older UI over the Vite source.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then(async (registrations) => {
      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
      if ("caches" in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(
          cacheNames.map((cacheName) => window.caches.delete(cacheName)),
        );
      }
    });
}

completeStartupTask("runtime", "正在載入介面");
configureConnectivityEvents();

void preloadAppRoute(window.location.pathname)
  .then(() => completeStartupTask("route", "正在準備目前頁面"))
  .catch(() => failStartup("目前頁面載入失敗，請重新嘗試。"));

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <NavigationTransitionProvider>
        <AuthProvider>
          <PwaUpdateProvider>
            <App />
            <Toaster position="top-center" richColors />
          </PwaUpdateProvider>
        </AuthProvider>
      </NavigationTransitionProvider>
    ),
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: offlinePersister,
        maxAge: OFFLINE_MAX_AGE,
        buster: OFFLINE_CACHE_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistQuery,
          shouldDehydrateMutation: () => false,
        },
      }}
      onSuccess={() => completeStartupTask("cache", "正在讀取上次資料")}
      onError={() => completeStartupTask("cache", "正在準備新的離線空間")}
    >
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
