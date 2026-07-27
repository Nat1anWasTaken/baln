/// <reference types="vite-plugin-pwa/client" />

type BalnStartupTask =
  "runtime" | "cache" | "route" | "session" | "commit" | "paint";

interface BalnStartupController {
  complete: (task: BalnStartupTask, label?: string) => void;
  fail: (label?: string) => void;
  finishAfterPaint: () => void;
  setStatus: (label: string) => void;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface Window {
  __BALN_STARTUP__?: BalnStartupController;
  BeforeInstallPromptEvent?: BeforeInstallPromptEvent;
}

interface Navigator {
  standalone?: boolean;
}
