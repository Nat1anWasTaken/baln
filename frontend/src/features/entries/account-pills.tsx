import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Account } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export function AccountPills({
  accounts,
  value,
  label,
  id,
  className,
  itemClassName,
  onValueChange,
}: {
  accounts: Account[];
  value: string;
  label: string;
  id?: string;
  className?: string;
  itemClassName?: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <ToggleGroup
      id={id}
      type="single"
      variant="pill"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) onValueChange(nextValue);
      }}
      aria-label={label}
      className={cn("flex w-full flex-wrap justify-start gap-2", className)}
    >
      {accounts.map((account) => (
        <ToggleGroupItem
          key={account.id}
          value={account.key}
          title={account.key}
          className={cn("max-w-full overflow-hidden", itemClassName)}
        >
          <span className="truncate">{account.name}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
