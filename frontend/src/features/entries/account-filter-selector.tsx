import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { accountTypeLabels, accountTypes } from "@/lib/account";
import { cn } from "@/lib/utils";
import type { Account, AccountType } from "@/lib/schemas";

type AccountFilterSelectorProps = {
  accounts: Account[];
  value: string;
  onValueChange: (value: string) => void;
  isLoading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
};

function matchesSearch(account: Account, search: string) {
  const normalized = search.trim().toLocaleLowerCase();
  if (!normalized) return true;

  return [account.name, account.key, accountTypeLabels[account.type]].some(
    (value) => value.toLocaleLowerCase().includes(normalized),
  );
}

function firstPopulatedType(accounts: Account[]) {
  return (
    accountTypes.find((type) =>
      accounts.some((account) => !account.archived && account.type === type),
    ) ?? accountTypes[0]
  );
}

function AccountPills({
  accounts,
  value,
  label,
  onValueChange,
}: {
  accounts: Account[];
  value: string;
  label: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <ToggleGroup
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

function AccountGroup({
  type,
  accounts,
  value,
  onValueChange,
  className,
}: {
  type: AccountType;
  accounts: Account[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  if (accounts.length === 0) return null;

  const label = accountTypeLabels[type];
  return (
    <section className={cn("grid min-w-0 content-start gap-2", className)}>
      <h3 className="text-xs font-medium text-muted-foreground">
        {label}
        <span className="ml-1 font-normal tabular-nums">{accounts.length}</span>
      </h3>
      <AccountPills
        accounts={accounts}
        value={value}
        label={`${label}帳戶`}
        onValueChange={onValueChange}
      />
    </section>
  );
}

export function AccountFilterSelector({
  accounts,
  value,
  onValueChange,
  isLoading = false,
  errorMessage,
  onRetry,
}: AccountFilterSelectorProps) {
  const selectedAccount = accounts.find((account) => account.key === value);
  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.archived),
    [accounts],
  );
  const archivedAccounts = useMemo(
    () => accounts.filter((account) => account.archived),
    [accounts],
  );
  const [searchState, setSearchState] = useState({
    filterValue: value,
    text: "",
  });
  const search = searchState.filterValue === value ? searchState.text : "";
  const [mobileGroup, setMobileGroup] = useState<{
    filterValue: string;
    type: AccountType;
    userSelected: boolean;
  }>({
    filterValue: value,
    type:
      selectedAccount && !selectedAccount.archived
        ? selectedAccount.type
        : firstPopulatedType(accounts),
    userSelected: false,
  });
  const [archivedOpen, setArchivedOpen] = useState(false);
  const selectedActiveType =
    selectedAccount && !selectedAccount.archived
      ? selectedAccount.type
      : undefined;
  const activeType =
    mobileGroup.filterValue === value &&
    mobileGroup.userSelected &&
    activeAccounts.some((account) => account.type === mobileGroup.type)
      ? mobileGroup.type
      : (selectedActiveType ?? firstPopulatedType(accounts));

  const searching = Boolean(search.trim());
  const filteredActive = activeAccounts.filter((account) =>
    matchesSearch(account, search),
  );
  const filteredArchived = archivedAccounts.filter((account) =>
    matchesSearch(account, search),
  );
  const selectedArchived = Boolean(selectedAccount?.archived);
  const archivedForcedOpen =
    selectedArchived || (searching && filteredArchived.length > 0);

  function selectAccount(nextValue: string) {
    const nextAccount = accounts.find((account) => account.key === nextValue);
    setSearchState({ filterValue: nextValue, text: "" });
    setMobileGroup({
      filterValue: nextValue,
      type:
        nextAccount && !nextAccount.archived ? nextAccount.type : activeType,
      userSelected: true,
    });
    onValueChange(nextValue);
  }

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(event) =>
            setSearchState({ filterValue: value, text: event.target.value })
          }
          aria-label="搜尋帳戶選項"
          placeholder="依名稱、代碼或類型搜尋"
          className="pl-8"
          disabled={isLoading || Boolean(errorMessage)}
        />
      </div>

      <ToggleGroup
        type="single"
        variant="pill"
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) selectAccount(nextValue);
        }}
        aria-label="所有帳戶"
        className="justify-start"
      >
        <ToggleGroupItem value="all">所有帳戶</ToggleGroupItem>
      </ToggleGroup>

      {isLoading ? (
        <div aria-label="正在載入帳戶選項" className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        </div>
      ) : errorMessage ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
        >
          <span>
            無法載入帳戶選項。
            {value !== "all" ? `目前仍依 ${value} 篩選。` : null}
          </span>
          {onRetry ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
              重試
            </Button>
          ) : null}
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚未建立帳戶。</p>
      ) : filteredActive.length === 0 && filteredArchived.length === 0 ? (
        <p className="text-sm text-muted-foreground">找不到符合的帳戶。</p>
      ) : (
        <>
          {!searching && activeAccounts.length > 0 ? (
            <Tabs
              value={activeType}
              onValueChange={(nextValue) =>
                setMobileGroup({
                  filterValue: value,
                  type: nextValue as AccountType,
                  userSelected: true,
                })
              }
              className="md:hidden"
            >
              <TabsList className="grid h-auto w-full grid-cols-5">
                {accountTypes.map((type) => (
                  <TabsTrigger
                    key={type}
                    value={type}
                    disabled={
                      !activeAccounts.some((account) => account.type === type)
                    }
                  >
                    {accountTypeLabels[type]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}

          {filteredActive.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {accountTypes.map((type) => (
                <AccountGroup
                  key={type}
                  type={type}
                  accounts={filteredActive.filter(
                    (account) => account.type === type,
                  )}
                  value={value}
                  onValueChange={selectAccount}
                  className={
                    searching || type === activeType
                      ? undefined
                      : "hidden md:grid"
                  }
                />
              ))}
            </div>
          ) : null}

          {filteredArchived.length > 0 ? (
            <Collapsible
              open={archivedForcedOpen || archivedOpen}
              onOpenChange={setArchivedOpen}
              className="border-t pt-2"
            >
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="group -ml-2 text-muted-foreground"
                >
                  已封存帳戶
                  <Badge variant="outline">{filteredArchived.length}</Badge>
                  <ChevronDown
                    className="transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-4 pt-3 md:grid-cols-2 xl:grid-cols-3">
                {accountTypes.map((type) => (
                  <AccountGroup
                    key={type}
                    type={type}
                    accounts={filteredArchived.filter(
                      (account) => account.type === type,
                    )}
                    value={value}
                    onValueChange={selectAccount}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </>
      )}
    </div>
  );
}

export type { AccountFilterSelectorProps };
