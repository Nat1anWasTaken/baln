import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { BudgetStatus } from "@/lib/schemas";

type BudgetFilterSelectorProps = {
  budgets: BudgetStatus[];
  value: string;
  onValueChange: (value: string) => void;
  isLoading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
};

export function BudgetFilterSelector({
  budgets,
  value,
  onValueChange,
  isLoading = false,
  errorMessage,
  onRetry,
}: BudgetFilterSelectorProps) {
  return (
    <div className="grid gap-3">
      <ToggleGroup
        type="single"
        variant="pill"
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) onValueChange(nextValue);
        }}
        aria-label="所有預算"
        className="flex w-full flex-wrap justify-start gap-2"
        disabled={isLoading || Boolean(errorMessage)}
      >
        <ToggleGroupItem value="all">所有預算</ToggleGroupItem>
        {budgets.map((budget) => (
          <ToggleGroupItem
            key={budget.id}
            value={budget.id}
            title={budget.name}
            className="max-w-full overflow-hidden"
          >
            <span className="truncate">{budget.name}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {isLoading ? (
        <div aria-label="正在載入預算選項" className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-16 rounded-full" />
        </div>
      ) : errorMessage ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
        >
          <span>
            無法載入預算選項。
            {value !== "all" ? `目前仍依 ${value} 篩選。` : null}
          </span>
          {onRetry ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
              重試
            </Button>
          ) : null}
        </div>
      ) : budgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚未建立預算。</p>
      ) : null}
    </div>
  );
}

export type { BudgetFilterSelectorProps };
