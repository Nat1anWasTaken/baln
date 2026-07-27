import { onlineManager } from "@tanstack/react-query";

export const BALN_ONLINE_EVENT = "baln:online";
export const BALN_OFFLINE_EVENT = "baln:offline";

let connectivityConfigured = false;

export function configureConnectivityEvents() {
  connectivityConfigured = true;

  onlineManager.setEventListener((setOnline) => {
    const handleOnline = () => {
      window.dispatchEvent(new Event(BALN_ONLINE_EVENT));
    };
    const handleOffline = () => {
      setOnline(false);
      window.dispatchEvent(new Event(BALN_OFFLINE_EVENT));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  });
}

export function pauseNetworkQueries() {
  onlineManager.setOnline(false);
}

export function reportNetworkFailure() {
  if (!connectivityConfigured) {
    return;
  }

  pauseNetworkQueries();
  window.dispatchEvent(new Event(BALN_OFFLINE_EVENT));
}

export function resumeNetworkQueries() {
  onlineManager.setOnline(true);
}

export function networkQueriesAreOnline() {
  return onlineManager.isOnline();
}
