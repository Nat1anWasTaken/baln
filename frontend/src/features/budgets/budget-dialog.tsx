import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { accountTypeLabels, accountTypes } from "@/lib/account";
import { budgetsApi } from "@/lib/api-client";
import { todayTaipei } from "@/lib/format";
import { invalidateAfterBudgetWrite } from "@/lib/query-invalidation";
import type {
  Account,
  BudgetPeriodUnit,
  BudgetRolloverMode,
  BudgetStatus,
  CreateBudgetRequest,
  RolloverEditMode,
  UpdateBudgetRequest,
} from "@/lib/schemas";

type Values = CreateBudgetRequest;

function defaults(budget?: BudgetStatus): Values {
  return budget
    ? {
        name: budget.name,
        amount_minor: budget.amount_minor,
        start_date: budget.start_date,
        period_count: budget.period_count,
        period_unit: budget.period_unit,
        rollover_mode: budget.rollover_mode,
        account_keys: budget.accounts.map((account) => account.key),
        show_on_overview: budget.show_on_overview,
      }
    : {
        name: "",
        amount_minor: 0,
        start_date: todayTaipei(),
        period_count: 1,
        period_unit: "month",
        rollover_mode: "accumulate",
        account_keys: [],
        show_on_overview: true,
      };
}

function definitionChanged(values: Values, budget: BudgetStatus) {
  const currentKeys = [...budget.accounts.map((account) => account.key)].sort();
  const nextKeys = [...values.account_keys].sort();
  return (
    values.amount_minor !== budget.amount_minor ||
    values.start_date !== budget.start_date ||
    values.period_count !== budget.period_count ||
    values.period_unit !== budget.period_unit ||
    values.rollover_mode !== budget.rollover_mode ||
    currentKeys.join("\0") !== nextKeys.join("\0")
  );
}

export function BudgetDialog({
  open,
  onOpenChange,
  accounts,
  budget,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  budget?: BudgetStatus;
}) {
  const queryClient = useQueryClient();
  const initial = useMemo(() => defaults(budget), [budget]);
  const [values, setValues] = useState(initial);
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingUpdate, setPendingUpdate] =
    useState<UpdateBudgetRequest | null>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const valid = Boolean(
    values.name.trim() &&
    Number.isSafeInteger(values.amount_minor) &&
    values.amount_minor > 0 &&
    Number.isSafeInteger(values.period_count) &&
    values.period_count > 0 &&
    values.start_date &&
    values.account_keys.length,
  );

  const save = useMutation({
    mutationFn: (payload: Values | UpdateBudgetRequest) =>
      budget
        ? budgetsApi.update(budget.id, payload as UpdateBudgetRequest)
        : budgetsApi.create(payload as Values),
    onSuccess: async () => {
      await invalidateAfterBudgetWrite(queryClient);
      toast.success(budget ? "預算已更新" : "預算已建立");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  function requestClose() {
    if (save.isPending) return;
    if (dirty) setDiscardOpen(true);
    else onOpenChange(false);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!valid) {
      const invalidId = !values.name.trim()
        ? "budget-name"
        : !Number.isSafeInteger(values.amount_minor) || values.amount_minor <= 0
          ? "budget-amount"
          : !values.start_date
            ? "budget-start-date"
            : !Number.isSafeInteger(values.period_count) ||
                values.period_count <= 0
              ? "budget-period-count"
              : "budget-account-search";
      requestAnimationFrame(() => document.getElementById(invalidId)?.focus());
      return;
    }
    const normalized = { ...values, name: values.name.trim() };
    if (budget) {
      if (definitionChanged(normalized, budget)) {
        setPendingUpdate(normalized);
      } else {
        save.mutate({
          name: normalized.name,
          show_on_overview: normalized.show_on_overview,
        });
      }
      return;
    }
    save.mutate(normalized);
  }

  function applyEditMode(mode: RolloverEditMode) {
    if (!pendingUpdate) return;
    save.mutate({ ...pendingUpdate, rollover_edit_mode: mode });
  }

  const normalizedSearch = search.trim().toLocaleLowerCase();

  return (
    <>
      <Dialog
        open={open && pendingUpdate === null && !discardOpen}
        mobileProps={{ dismissible: !save.isPending }}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <DialogContent
          mobileSize="near-full"
          className="md:flex md:max-h-[calc(100dvh-2rem)] md:max-w-2xl md:flex-col md:overflow-hidden"
          closeLabel={budget ? "關閉編輯預算" : "關閉新增預算"}
        >
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{budget ? "編輯預算" : "新增預算"}</DialogTitle>
              <DialogDescription>
                設定週期、額度與用來篩選交易的帳戶。
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="min-h-0 flex-1 overflow-y-auto grid gap-5">
              <Field data-invalid={submitted && !values.name.trim()}>
                <FieldLabel htmlFor="budget-name">預算名稱</FieldLabel>
                <Input
                  id="budget-name"
                  aria-invalid={submitted && !values.name.trim()}
                  value={values.name}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：日常開銷"
                />
                {submitted && !values.name.trim() ? (
                  <FieldError>請輸入預算名稱。</FieldError>
                ) : null}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  data-invalid={
                    submitted &&
                    (!Number.isSafeInteger(values.amount_minor) ||
                      values.amount_minor <= 0)
                  }
                >
                  <FieldLabel htmlFor="budget-amount">每期額度</FieldLabel>
                  <Input
                    id="budget-amount"
                    aria-invalid={
                      submitted &&
                      (!Number.isSafeInteger(values.amount_minor) ||
                        values.amount_minor <= 0)
                    }
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={values.amount_minor || ""}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        amount_minor: Number(event.target.value),
                      }))
                    }
                  />
                  <FieldDescription>以 TWD 整數金額計算。</FieldDescription>
                  {submitted &&
                  (!Number.isSafeInteger(values.amount_minor) ||
                    values.amount_minor <= 0) ? (
                    <FieldError>請輸入大於零的整數額度。</FieldError>
                  ) : null}
                </Field>
                <Field data-invalid={submitted && !values.start_date}>
                  <FieldLabel htmlFor="budget-start-date">開始日期</FieldLabel>
                  <Input
                    id="budget-start-date"
                    aria-invalid={submitted && !values.start_date}
                    type="date"
                    value={values.start_date}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        start_date: event.target.value,
                      }))
                    }
                  />
                  {submitted && !values.start_date ? (
                    <FieldError>請選擇開始日期。</FieldError>
                  ) : null}
                </Field>
              </div>
              <div className="grid grid-cols-[1fr_1fr] gap-4">
                <Field
                  data-invalid={
                    submitted &&
                    (!Number.isSafeInteger(values.period_count) ||
                      values.period_count <= 0)
                  }
                >
                  <FieldLabel htmlFor="budget-period-count">
                    週期長度
                  </FieldLabel>
                  <Input
                    id="budget-period-count"
                    aria-invalid={
                      submitted &&
                      (!Number.isSafeInteger(values.period_count) ||
                        values.period_count <= 0)
                    }
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={values.period_count}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        period_count: Number(event.target.value),
                      }))
                    }
                  />
                  {submitted &&
                  (!Number.isSafeInteger(values.period_count) ||
                    values.period_count <= 0) ? (
                    <FieldError>請輸入大於零的整數週期。</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="budget-period-unit">單位</FieldLabel>
                  <Combobox
                    id="budget-period-unit"
                    value={values.period_unit}
                    onValueChange={(value) =>
                      setValues((current) => ({
                        ...current,
                        period_unit: value as BudgetPeriodUnit,
                      }))
                    }
                    options={[
                      { value: "day", label: "天" },
                      { value: "week", label: "週" },
                      { value: "month", label: "月" },
                      { value: "year", label: "年" },
                    ]}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="budget-rollover-mode">
                  餘額沿襲方式
                </FieldLabel>
                <Combobox
                  id="budget-rollover-mode"
                  value={values.rollover_mode}
                  onValueChange={(value) =>
                    setValues((current) => ({
                      ...current,
                      rollover_mode: value as BudgetRolloverMode,
                    }))
                  }
                  options={[
                    { value: "accumulate", label: "累加餘額" },
                    { value: "surplus_only", label: "只沿襲剩餘" },
                    { value: "reset", label: "每期重設" },
                  ]}
                />
                <FieldDescription>
                  {values.rollover_mode === "accumulate"
                    ? "每期剩餘或超支都會帶入下一期。"
                    : values.rollover_mode === "surplus_only"
                      ? "只把未使用的餘額帶入下一期；超支不會延續。"
                      : "每一期都只使用當期額度，不沿襲剩餘或超支。"}
                </FieldDescription>
              </Field>
              <Field
                data-invalid={submitted && values.account_keys.length === 0}
              >
                <FieldLabel>包含的帳戶</FieldLabel>
                <FieldDescription>
                  符合任一所選帳戶的交易，其支出分錄只計算一次；轉帳不會消耗預算。
                </FieldDescription>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="budget-account-search"
                    aria-label="搜尋預算帳戶"
                    aria-invalid={submitted && values.account_keys.length === 0}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="依名稱、代碼或類型搜尋"
                    className="pl-8"
                  />
                </div>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  {accountTypes.map((type) => {
                    const options = accounts.filter((account) => {
                      if (account.type !== type) return false;
                      const selected = values.account_keys.includes(
                        account.key,
                      );
                      if (account.archived && !selected) return false;
                      return (
                        !normalizedSearch ||
                        [
                          account.name,
                          account.key,
                          accountTypeLabels[type],
                        ].some((value) =>
                          value.toLocaleLowerCase().includes(normalizedSearch),
                        )
                      );
                    });
                    if (!options.length) return null;
                    return (
                      <fieldset
                        key={type}
                        className="grid min-w-0 content-start gap-2"
                      >
                        <legend className="text-xs font-medium text-muted-foreground">
                          {accountTypeLabels[type]}
                        </legend>
                        <div className="grid gap-1">
                          {options.map((account) => {
                            const checked = values.account_keys.includes(
                              account.key,
                            );
                            return (
                              <label
                                key={account.id}
                                className="touch-surface flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-2 text-sm"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(next) =>
                                    setValues((current) => ({
                                      ...current,
                                      account_keys: next
                                        ? [...current.account_keys, account.key]
                                        : current.account_keys.filter(
                                            (key) => key !== account.key,
                                          ),
                                    }))
                                  }
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {account.name}
                                  {account.archived ? "（已封存）" : ""}
                                </span>
                                <span className="min-w-0 max-w-[45%] shrink truncate text-xs text-muted-foreground">
                                  {account.key}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
                {submitted && values.account_keys.length === 0 ? (
                  <FieldError>請至少選擇一個帳戶。</FieldError>
                ) : null}
              </Field>
              <div className="flex min-h-11 items-center gap-3">
                <Switch
                  id="budget-overview"
                  checked={values.show_on_overview}
                  onCheckedChange={(checked) =>
                    setValues((current) => ({
                      ...current,
                      show_on_overview: checked,
                    }))
                  }
                />
                <FieldLabel htmlFor="budget-overview">顯示在總覽</FieldLabel>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={requestClose}
              >
                取消
              </Button>
              <Button type="submit" loading={save.isPending}>
                儲存預算
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={pendingUpdate !== null}
        onOpenChange={(next) => {
          if (!next && !save.isPending) setPendingUpdate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>如何處理累計餘額？</AlertDialogTitle>
            <AlertDialogDescription>
              新的設定會立即生效。你可以保留目前累計，或從開始日期重新計算。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={save.isPending}>
              返回編輯
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              loading={save.isPending}
              onClick={() => applyEditMode("preserve")}
            >
              保留累計
            </Button>
            <AlertDialogAction
              loading={save.isPending}
              onClick={(event) => {
                event.preventDefault();
                applyEditMode("recalculate");
              }}
            >
              重新計算
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>捨棄未儲存的預算？</AlertDialogTitle>
            <AlertDialogDescription>
              尚未儲存的週期、額度與帳戶選擇都會遺失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>繼續編輯</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => onOpenChange(false)}
            >
              捨棄變更
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
