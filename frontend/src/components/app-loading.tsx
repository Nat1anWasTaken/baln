import { Landmark } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

export function AppLoading({ label = "載入中" }: { label?: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Landmark className="size-6" aria-hidden="true" />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="grid w-full gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-4/5 justify-self-center" />
        </div>
      </div>
    </main>
  );
}
