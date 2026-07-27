import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

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

  return null;
}
