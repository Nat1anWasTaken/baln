import * as React from "react";
import { ChevronsUpDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ComboboxOption = {
  value: string;
  label: string;
  keywords?: string[];
  disabled?: boolean;
};

type ComboboxGroup = {
  label: string;
  options: ComboboxOption[];
};

type ComboboxProps = {
  id?: string;
  value?: string;
  onValueChange: (value: string) => void;
  options?: ComboboxOption[];
  groups?: ComboboxGroup[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
};

function Combobox({
  id,
  value,
  onValueChange,
  options = [],
  groups = [],
  placeholder = "選擇項目",
  searchPlaceholder = "搜尋…",
  emptyText = "找不到項目。",
  disabled = false,
  className,
  "aria-invalid": ariaInvalid,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const allOptions = [...options, ...groups.flatMap((group) => group.options)];
  const selectedOption = allOptions.find((option) => option.value === value);

  function renderOption(option: ComboboxOption) {
    return (
      <CommandItem
        key={option.value}
        value={option.value}
        keywords={[option.label, ...(option.keywords ?? [])]}
        disabled={option.disabled}
        data-checked={option.value === value}
        onSelect={() => {
          onValueChange(option.value);
          setOpen(false);
        }}
      >
        {option.label}
      </CommandItem>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selectedOption && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {options.length > 0 ? (
              <CommandGroup>{options.map(renderOption)}</CommandGroup>
            ) : null}
            {groups.map((group) =>
              group.options.length > 0 ? (
                <CommandGroup key={group.label} heading={group.label}>
                  {group.options.map(renderOption)}
                </CommandGroup>
              ) : null,
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { Combobox };
export type { ComboboxGroup, ComboboxOption, ComboboxProps };
