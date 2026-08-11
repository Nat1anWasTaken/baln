import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

type PwaUpdateContextValue = {
  checkForUpdate: () => Promise<boolean>;
  isChecking: boolean;
};

const PwaUpdateContext = createContext<PwaUpdateContextValue | null>(null);

export function usePwaUpdate() {
  const context = useContext(PwaUpdateContext);
  if (!context) {
    throw new Error("usePwaUpdate must be used within PwaUpdateProvider");
  }
  return context;
}

export function PwaUpdateProvider({ children }: { children: ReactNode }) {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const checkingRef = useRef(false);
  const [isChecking, setIsChecking] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_scriptUrl, registration) => {
      registrationRef.current = registration ?? null;
    },
  });

  const checkForUpdate = useCallback(async () => {
    if (checkingRef.current) return false;

    checkingRef.current = true;
    setIsChecking(true);
    try {
      if (!("serviceWorker" in navigator)) {
        throw new Error("Service workers are not supported");
      }

      const registration =
        registrationRef.current ??
        (await navigator.serviceWorker.getRegistration());
      if (!registration) {
        throw new Error("No service worker is registered");
      }

      await registration.update();
      const hasUpdate = registration.waiting !== null;
      if (hasUpdate) setNeedRefresh(true);
      return hasUpdate;
    } finally {
      checkingRef.current = false;
      setIsChecking(false);
    }
  }, [setNeedRefresh]);

  useEffect(() => {
    if (!offlineReady) return;
    toast.success("Baln 已可離線開啟");
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  useEffect(() => {
    if (!needRefresh) return;
    toast.info("Baln 有新版本可用", {
      duration: Infinity,
      action: {
        label: "重新載入",
        onClick: () => void updateServiceWorker(true),
      },
      cancel: {
        label: "稍後",
        onClick: () => setNeedRefresh(false),
      },
    });
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return (
    <PwaUpdateContext.Provider value={{ checkForUpdate, isChecking }}>
      {children}
    </PwaUpdateContext.Provider>
  );
}
