import { BrandIcon } from "@/components/brand-icon";
import { CenteredPage } from "@/components/centered-page";
import { IconBadge } from "@/components/icon-badge";
import { Skeleton } from "@/components/ui/skeleton";

export function AppLoading({ label = "載入中" }: { label?: string }) {
  return (
    <CenteredPage>
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <IconBadge>
          <BrandIcon className="size-6" aria-hidden="true" />
        </IconBadge>
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="grid w-full gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-4/5 justify-self-center" />
        </div>
      </div>
    </CenteredPage>
  );
}
