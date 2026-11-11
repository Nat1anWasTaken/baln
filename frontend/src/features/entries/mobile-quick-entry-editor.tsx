import { ChevronDown, Wallet } from "lucide-react";
import { m } from "motion/react";
import { useCallback, useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { useLocation } from "react-router-dom";

import { AppLink } from "@/components/navigation-transition";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NumericKeypadDisplay } from "@/components/ui/number-field";
import { NumericKeypad } from "@/components/ui/numeric-keypad";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import { SwitchField } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AccountPills } from "@/features/entries/account-pills";
import {
  entryEditorPageFooterClassName,
  EntryEditorRootError,
  useEditorValuesSync,
} from "@/features/entries/entry-editor";
import { DuplicateEntryDialog } from "@/features/entries/entry-submission";
import {
  blankQuickEntryValues,
  quickEntryFundingTypes,
  quickEntryKindLabels,
  sortByRecentKeys,
  type QuickEntryKind,
  type QuickEntryValues,
} from "@/features/entries/quick-entry";
import {
  focusFirstInvalidField,
  MissingAccounts,
  quickEntryFundingLabels,
  quickEntryKinds,
  type QuickEntryEditorProps,
  type QuickEntryFieldOrder,
  useQuickEntryForm,
} from "@/features/entries/quick-entry-form";
import {
  type QuickEntryMemory,
  useQuickEntryMemory,
} from "@/hooks/use-quick-entry-memory";
import { motionSpring } from "@/lib/motion";
import {
  applyKeypadKey,
  keypadDigits,
  keypadValue,
} from "@/lib/numeric-keypad";
import type { Account } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/** Field order as rendered on phones, so validation focuses the first error. */
const mobileFieldOrder: QuickEntryFieldOrder = [
  ["date", "quick-entry-date"],
  ["amount", "quick-entry-amount"],
  ["categoryKey", "quick-entry-category"],
  ["fundingKey", "quick-entry-funding"],
];

const otherKind: Record<QuickEntryKind, QuickEntryKind> = {
  expense: "income",
  income: "expense",
};

/**
 * The funding account a new quick entry starts with: the one last used for
 * this kind, else for the other kind, else the only eligible account.
 */
function defaultFundingKey(
  memory: QuickEntryMemory,
  fundingKeys: string,
  kind: QuickEntryKind,
) {
  const eligible = fundingKeys ? fundingKeys.split("\n") : [];
  const remembered = [
    memory[kind].fundingKey,
    memory[otherKind[kind]].fundingKey,
  ].find((key) => key && eligible.includes(key));
  if (remembered) return remembered;
  return eligible.length === 1 ? eligible[0] : "";
}

/**
 * A phone-first quick entry: a large amount typed on an on-screen keypad,
 * recently used categories in one swipeable row, and the last used account
 * already chosen, so a typical expense takes a few taps and no typing.
 */
export function MobileQuickEntryEditor({
  accounts,
  draft,
  presentation = "page",
  onDirtyChange,
  onNavigate,
  onPendingChange,
  onSaved,
  onValuesChange,
}: QuickEntryEditorProps) {
  const { search } = useLocation();
  const { memory, remember } = useQuickEntryMemory();

  const fundingAccounts = accounts.filter(
    (account) =>
      !account.archived && quickEntryFundingTypes.includes(account.type),
  );
  const fundingKeys = fundingAccounts.map((account) => account.key).join("\n");

  // An account chosen by the user, or carried over, stays put when the kind
  // changes; one the editor filled in follows the kind's last used account.
  const [fundingPicked, setFundingPicked] = useState(
    Boolean(draft?.fundingKey),
  );
  const [defaults] = useState<QuickEntryValues>(() => {
    const base = draft ?? blankQuickEntryValues();
    return base.fundingKey
      ? base
      : {
          ...base,
          fundingKey: defaultFundingKey(memory, fundingKeys, base.kind),
        };
  });

  const { form, kind, categoryTypes, categoryAccounts, submission, submit } =
    useQuickEntryForm({
      accounts,
      defaults,
      descriptionFallback: true,
      onDirtyChange,
      onPendingChange,
      onSaved,
      onSavedValues: (values) =>
        remember({
          kind: values.kind,
          categoryKey: values.categoryKey,
          fundingKey: values.fundingKey,
        }),
    });

  const expenseFundingKey = defaultFundingKey(memory, fundingKeys, "expense");
  const incomeFundingKey = defaultFundingKey(memory, fundingKeys, "income");
  const reportValues = useCallback(
    (values: QuickEntryValues) => {
      const filledIn =
        values.kind === "expense" ? expenseFundingKey : incomeFundingKey;
      onValuesChange?.(values, fundingPicked ? "" : filledIn);
    },
    [expenseFundingKey, fundingPicked, incomeFundingKey, onValuesChange],
  );
  useEditorValuesSync({
    form,
    onValuesChange: onValuesChange ? reportValues : undefined,
  });

  // Memory is read once per editor, so this order never shifts mid-entry.
  const recentCategories = sortByRecentKeys(
    categoryAccounts,
    memory[kind].recentCategoryKeys,
  );

  // The keypad writes the amount, so the field is registered only for its
  // validation rule and read back for display.
  form.register("amount", {
    validate: (value) =>
      (Number.isSafeInteger(value) && value > 0) || "請輸入大於零的整數金額。",
  });
  const amountValue = useWatch({ control: form.control, name: "amount" });
  // The account is picked in a sheet rather than a form control.
  form.register("fundingKey", { required: "請選擇帳戶。" });

  const errors = form.formState.errors;
  const categoryKey = useWatch({ control: form.control, name: "categoryKey" });
  const fundingKey = useWatch({ control: form.control, name: "fundingKey" });
  const categoryName = categoryAccounts.find(
    (account) => account.key === categoryKey,
  )?.name;
  const funding = fundingAccounts.find((account) => account.key === fundingKey);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(
    () => Boolean(defaults.note) || defaults.excludedFromBudgets,
  );

  function changeKind(nextKind: QuickEntryKind) {
    form.setValue("kind", nextKind, { shouldDirty: true });
    form.setValue("categoryKey", "", { shouldDirty: true });
    form.clearErrors("categoryKey");
    if (!fundingPicked) {
      form.setValue(
        "fundingKey",
        defaultFundingKey(memory, fundingKeys, nextKind),
        {
          shouldDirty: true,
        },
      );
    }
  }

  function pickFunding(account: Account) {
    setFundingPicked(true);
    form.setValue("fundingKey", account.key, { shouldDirty: true });
    form.clearErrors("fundingKey");
    setFundingOpen(false);
  }

  const EditorBody = presentation === "sheet" ? DialogBody : "div";
  const EditorFooter = presentation === "sheet" ? DialogFooter : "div";
  const amountDigits = keypadDigits(amountValue);

  return (
    <form
      data-presentation={presentation}
      data-layout="mobile-quick"
      className={cn(
        presentation === "page" ? "grid gap-5" : "flex min-h-0 flex-1 flex-col",
      )}
      onSubmit={form.handleSubmit(submit, (invalid) =>
        focusFirstInvalidField(invalid, mobileFieldOrder),
      )}
    >
      <EditorBody
        data-entry-editor-scroll={presentation === "sheet" ? "" : undefined}
        className={cn(
          // One shrinkable column: the swipeable category row must scroll
          // inside the sheet, not widen every row to the width of all chips.
          "grid auto-rows-max grid-cols-1 content-start gap-3",
          presentation === "sheet" && "py-4",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <ToggleGroup
            id="quick-entry-kind"
            type="single"
            variant="pill"
            aria-label="類型"
            value={kind}
            onValueChange={(nextKind) => {
              if (nextKind && nextKind !== kind) {
                changeKind(nextKind as QuickEntryKind);
              }
            }}
            className="gap-2"
          >
            {quickEntryKinds.map((option) => (
              <ToggleGroupItem key={option} value={option}>
                {quickEntryKindLabels[option]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Controller
            control={form.control}
            name="date"
            rules={{ required: "請選擇交易日期。" }}
            render={({ field, fieldState }) => (
              <DatePicker
                ref={field.ref}
                id="quick-entry-date"
                aria-label="交易日期"
                value={field.value}
                required
                pickerTitle="選擇交易日期"
                aria-invalid={fieldState.invalid}
                className="w-auto"
                onValueChange={field.onChange}
              />
            )}
          />
        </div>
        {errors.date?.message ? (
          <FieldError className="-mt-2 text-end">
            {errors.date.message}
          </FieldError>
        ) : null}

        <Field
          data-invalid={Boolean(errors.amount?.message)}
          className="justify-items-center gap-1"
        >
          <NumericKeypadDisplay
            id="quick-entry-amount"
            tabIndex={-1}
            label="金額"
            digits={amountDigits}
            prefix="TWD"
            className={cn(
              "w-full",
              errors.amount?.message && "text-destructive",
            )}
          />
          <FieldError className="text-center">
            {errors.amount?.message}
          </FieldError>
        </Field>

        <Field data-invalid={Boolean(errors.description?.message)}>
          <FieldLabel htmlFor="quick-entry-description" className="sr-only">
            交易說明
          </FieldLabel>
          <Input
            id="quick-entry-description"
            enterKeyHint="done"
            autoComplete="off"
            placeholder={
              categoryName
                ? `說明（留空則為「${categoryName}」）`
                : "說明（選填）"
            }
            {...form.register("description")}
          />
        </Field>

        <Field
          data-invalid={Boolean(errors.categoryKey?.message)}
          className="min-w-0"
        >
          <FieldLabel htmlFor="quick-entry-category" className="sr-only">
            分類
          </FieldLabel>
          {categoryAccounts.length > 0 ? (
            <Controller
              control={form.control}
              name="categoryKey"
              rules={{ required: "請選擇分類。" }}
              render={({ field }) => (
                // Field stretches its direct children to its width, so the
                // row bleeds to the sheet edges from inside a plain wrapper.
                <div>
                  <AccountPills
                    id="quick-entry-category"
                    accounts={recentCategories}
                    label={`${quickEntryKindLabels[kind]}分類`}
                    value={field.value}
                    onValueChange={(next) => {
                      field.onChange(next);
                      form.clearErrors("categoryKey");
                    }}
                    className={cn(
                      "-mx-6 w-[calc(100%+3rem)] snap-x scroll-px-6 flex-nowrap overflow-x-auto px-6 pb-1 [scrollbar-width:none]",
                      presentation === "page" &&
                        "-mx-4 w-[calc(100%+2rem)] scroll-px-4 px-4",
                    )}
                    itemClassName="shrink-0 snap-start"
                  />
                </div>
              )}
            />
          ) : (
            <MissingAccounts
              types={categoryTypes}
              presentation={presentation}
              onNavigate={onNavigate}
            />
          )}
          <FieldError>{errors.categoryKey?.message}</FieldError>
        </Field>

        <Field data-invalid={Boolean(errors.fundingKey?.message)}>
          {fundingAccounts.length > 0 ? (
            <ResponsivePicker
              open={fundingOpen}
              onOpenChange={setFundingOpen}
              title={quickEntryFundingLabels[kind]}
              trigger={
                <Button
                  id="quick-entry-funding"
                  type="button"
                  variant="outline"
                  aria-label={`${quickEntryFundingLabels[kind]}：${funding?.name ?? "未選擇"}`}
                  aria-invalid={Boolean(errors.fundingKey?.message)}
                  className="w-full justify-start font-normal"
                >
                  <Wallet aria-hidden="true" />
                  <span className="text-muted-foreground">
                    {quickEntryFundingLabels[kind]}
                  </span>
                  <span
                    className={cn(
                      "ml-auto truncate",
                      !funding && "text-muted-foreground",
                    )}
                  >
                    {funding?.name ?? "請選擇"}
                  </span>
                  <ChevronDown aria-hidden="true" />
                </Button>
              }
            >
              <AccountPills
                accounts={fundingAccounts}
                label={quickEntryFundingLabels[kind]}
                value={fundingKey}
                onValueChange={(next) => {
                  const account = fundingAccounts.find(
                    (item) => item.key === next,
                  );
                  if (account) pickFunding(account);
                }}
              />
            </ResponsivePicker>
          ) : (
            <MissingAccounts
              types={quickEntryFundingTypes}
              presentation={presentation}
              onNavigate={onNavigate}
            />
          )}
          <FieldError>{errors.fundingKey?.message}</FieldError>
        </Field>

        <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground"
            >
              備註與預算
              <m.span
                animate={{ rotate: moreOpen ? 180 : 0 }}
                aria-hidden="true"
                className="inline-flex"
                initial={false}
                transition={motionSpring.layout}
              >
                <ChevronDown />
              </m.span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-4 pt-3">
            <Field>
              <FieldLabel htmlFor="quick-entry-note">交易備註</FieldLabel>
              <Textarea
                id="quick-entry-note"
                placeholder="選填"
                {...form.register("note")}
              />
            </Field>
            <Controller
              control={form.control}
              name="excludedFromBudgets"
              render={({ field }) => (
                <SwitchField
                  id="quick-entry-excluded-from-budgets"
                  label="不將此交易計入任何預算"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </CollapsibleContent>
        </Collapsible>

        <EntryEditorRootError message={errors.root?.message} />
      </EditorBody>

      <EditorFooter
        className={cn(
          "pt-2",
          presentation === "page" &&
            cn(entryEditorPageFooterClassName, "grid justify-stretch"),
        )}
      >
        {presentation === "page" ? (
          <Button
            asChild
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-end"
          >
            <AppLink
              to={{ pathname: "/entries", search }}
              transitionIntent="back"
            >
              取消
            </AppLink>
          </Button>
        ) : null}
        <NumericKeypad
          aria-label="金額鍵盤"
          disabled={submission.isPending}
          onKey={(key) => {
            const next = keypadValue(applyKeypadKey(amountDigits, key));
            form.setValue("amount", next, { shouldDirty: true });
            if (errors.amount && next > 0) form.clearErrors("amount");
          }}
          action={
            <Button
              type="submit"
              loading={submission.isPending}
              aria-label="建立交易"
              className="h-full rounded-3xl text-base"
            >
              建立
            </Button>
          }
        />
      </EditorFooter>

      <DuplicateEntryDialog
        {...submission.duplicateDialogProps}
        onBeforeConfirm={() => form.clearErrors("root")}
      />
    </form>
  );
}
