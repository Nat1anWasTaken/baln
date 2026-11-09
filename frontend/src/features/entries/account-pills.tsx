import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Account } from "@/lib/schemas";

export function AccountPills({
  accounts,
  value,
  label,
  id,
  onValueChange,
}: {
  accounts: Account[];
  value: string;
  label: string;
  id?: string;
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
      className="flex w-full flex-wrap justify-start gap-2"
    >
      {accounts.map((account) => (
        <ToggleGroupItem
          key={account.id}
          value={account.key}
          title={account.key}
          className="max-w-full overflow-hidden"
        >
          <span className="truncate">{account.name}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
