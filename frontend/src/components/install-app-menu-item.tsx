import { Download } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  getInstallState,
  requestInstall,
  subscribeInstallState,
  type InstallPlatform,
} from "@/lib/install-prompt";

const instructions: Record<
  Exclude<InstallPlatform, "chromium">,
  { title: string; description: string; steps: string[] }
> = {
  ios: {
    title: "將 Baln 加入主畫面",
    description: "Safari 會把 Baln 安裝成可獨立開啟的應用程式。",
    steps: [
      "點選 Safari 工具列的「分享」",
      "選擇「加入主畫面」",
      "點選「加入」",
    ],
  },
  "mac-safari": {
    title: "將 Baln 加入 Dock",
    description: "Safari 可以把 Baln 安裝到 Dock，並以獨立視窗開啟。",
    steps: [
      "打開 Safari 的「檔案」選單",
      "選擇「加入 Dock」",
      "確認名稱並加入",
    ],
  },
  unsupported: {
    title: "安裝 Baln",
    description: "目前的瀏覽器沒有提供網站內安裝提示。",
    steps: [
      "開啟瀏覽器的應用程式或更多選單",
      "尋找「安裝應用程式」或「加入主畫面」",
      "若沒有此選項，請改用支援安裝的 Chrome、Edge 或 Safari",
    ],
  },
};

export function InstallAppMenuItem() {
  const state = useSyncExternalStore(
    subscribeInstallState,
    getInstallState,
    getInstallState,
  );
  const [instructionPlatform, setInstructionPlatform] = useState<Exclude<
    InstallPlatform,
    "chromium"
  > | null>(null);

  if (state.installed) return null;

  async function handleInstall() {
    const result = await requestInstall();
    if (result.kind === "installed") {
      toast.success("Baln 已安裝");
    } else if (
      result.kind === "instructions" &&
      result.platform !== "chromium"
    ) {
      setInstructionPlatform(result.platform);
    }
  }

  const content = instructionPlatform
    ? instructions[instructionPlatform]
    : null;

  return (
    <>
      <DropdownMenuItem onSelect={() => void handleInstall()}>
        <Download aria-hidden="true" />
        安裝 Baln
      </DropdownMenuItem>
      <Dialog
        open={instructionPlatform !== null}
        onOpenChange={(open) => {
          if (!open) setInstructionPlatform(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{content?.title}</DialogTitle>
            <DialogDescription>{content?.description}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ol className="grid gap-3 text-sm">
              {content?.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setInstructionPlatform(null)}>
              知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
