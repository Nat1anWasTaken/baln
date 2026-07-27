export type InstallPlatform = "chromium" | "ios" | "mac-safari" | "unsupported";

export type InstallState = {
  installed: boolean;
  promptReady: boolean;
  platform: InstallPlatform;
};

type InstallResult =
  | { kind: "installed" }
  | { kind: "dismissed" }
  | { kind: "instructions"; platform: InstallPlatform };

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let state = readState();
const listeners = new Set<() => void>();

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigator.standalone === true
  );
}

function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  const isAppleMobile =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isAppleMobile) return "ios";
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua)) {
    return "mac-safari";
  }
  return deferredPrompt ? "chromium" : "unsupported";
}

function readState(): InstallState {
  return {
    installed: isStandalone(),
    promptReady: deferredPrompt !== null,
    platform: detectPlatform(),
  };
}

function emit() {
  state = readState();
  listeners.forEach((listener) => listener());
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  emit();
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  state = { ...readState(), installed: true };
  listeners.forEach((listener) => listener());
});

export function subscribeInstallState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallState() {
  return state;
}

export async function requestInstall(): Promise<InstallResult> {
  if (state.installed) return { kind: "installed" };
  if (!deferredPrompt) {
    return { kind: "instructions", platform: detectPlatform() };
  }

  const prompt = deferredPrompt;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  deferredPrompt = null;
  if (choice.outcome === "accepted") {
    state = { ...readState(), installed: true };
    listeners.forEach((listener) => listener());
    return { kind: "installed" };
  }
  emit();
  return { kind: "dismissed" };
}
