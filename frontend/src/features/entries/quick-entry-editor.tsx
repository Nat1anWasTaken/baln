import { Controller } from "react-hook-form";
import { useState } from "react";
import { useLocation } from "react-router-dom";

import { AppLink } from "@/components/navigation-transition";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { MobileQuickEntryEditor } from "@/features/entries/mobile-quick-entry-editor";
import {
  blankQuickEntryValues,
  quickEntryFundingTypes,
  quickEntryKindLabels,
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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/** Field order as rendered, so validation focuses the first visible error. */
const desktopFieldOrder: QuickEntryFieldOrder = [
  ["amount", "quick-entry-amount"],
  ["description", "quick-entry-description"],
  ["categoryKey", "quick-entry-category"],
  ["fundingKey", "quick-entry-funding"],
  ["date", "quick-entry-date"],
];

export function QuickEntryEditor(props: QuickEntryEditorProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <MobileQuickEntryEditor {...props} />
  ) : (
    <DesktopQuickEntryEditor {...props} />
  );
}

function DesktopQuickEntryEditor({
  accounts,
  draft,
  presentation = "page",
  onCancel,
  onDirtyChange,
  onNavigate,
  onPendingChange,
  onSaved,
  onValuesChange,
}: QuickEntryEditorProps) {
  const { search } = useLocation();
  const [defaults] = useState(() => draft ?? blankQuickEntryValues());
  const {
    form,
    kind,
    categoryTypes,
    categoryAccounts,
    fundingAccounts,
    submission,
    submit,
  } = useQuickEntryForm({
    accounts,
    defaults,
    onDirtyChange,
    onPendingChange,
    onSaved,
  });
  useEditorValuesSync({ form, onValuesChange });

  const errors = form.formState.errors;
  const EditorBody = presentation === "sheet" ? DialogBody : "div";
  const EditorFooter = presentation === "sheet" ? DialogFooter : "div";

  return (
    <form
      data-presentation={presentation}
      className={cn(
        presentation === "page" ? "grid gap-5" : "flex min-h-0 flex-1 flex-col",
      )}
      onSubmit={form.handleSubmit(submit, (errors) =>
        focusFirstInvalidField(errors, desktopFieldOrder),
      )}
    >
      <EditorBody
        data-entry-editor-scroll={presentation === "sheet" ? "" : undefined}
        className={cn(
          presentation === "page"
            ? "contents"
            : "grid auto-rows-max content-start gap-5",
        )}
      >
        <FieldGroup className="gap-5">
          <FieldSet className="gap-4">
            <FieldLegend>交易資料</FieldLegend>
            <Field>
              <FieldLabel htmlFor="quick-entry-kind">類型</FieldLabel>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <ToggleGroup
                    id="quick-entry-kind"
                    type="single"
                    variant="pill"
                    aria-label="類型"
                    value={field.value}
                    onValueChange={(nextKind) => {
                      if (!nextKind || nextKind === field.value) return;
                      field.onChange(nextKind);
                      form.setValue("categoryKey", "", { shouldDirty: true });
                      form.clearErrors("categoryKey");
                    }}
                    className="flex w-full flex-wrap justify-start gap-2"
                  >
                    {quickEntryKinds.map((option) => (
                      <ToggleGroupItem key={option} value={option}>
                        {quickEntryKindLabels[option]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <Field data-invalid={Boolean(errors.amount?.message)}>
                <FieldLabel htmlFor="quick-entry-amount">金額</FieldLabel>
                <Controller
                  control={form.control}
                  name="amount"
                  rules={{
                    validate: (amount) =>
                      (Number.isSafeInteger(amount) && amount > 0) ||
                      "請輸入大於零的整數金額。",
                  }}
                  render={({ field, fieldState }) => (
                    <Input
                      ref={field.ref}
                      id="quick-entry-amount"
                      name={field.name}
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      placeholder="0"
                      aria-invalid={fieldState.invalid}
                      value={field.value || ""}
                      onBlur={field.onBlur}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === ""
                            ? 0
                            : event.target.valueAsNumber,
                        )
                      }
                    />
                  )}
                />
                <FieldError>{errors.amount?.message}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.description?.message)}>
                <FieldLabel htmlFor="quick-entry-description">
                  交易說明
                </FieldLabel>
                <Input
                  id="quick-entry-description"
                  placeholder="例如：麥當勞早餐"
                  aria-invalid={Boolean(errors.description?.message)}
                  {...form.register("description", {
                    validate: (description) =>
                      Boolean(description.trim()) || "請輸入交易說明。",
                  })}
                />
                <FieldError>{errors.description?.message}</FieldError>
              </Field>
            </div>
            <Field data-invalid={Boolean(errors.categoryKey?.message)}>
              <FieldLabel htmlFor="quick-entry-category">分類</FieldLabel>
              {categoryAccounts.length > 0 ? (
                <Controller
                  control={form.control}
                  name="categoryKey"
                  rules={{ required: "請選擇分類。" }}
                  render={({ field }) => (
                    <AccountPills
                      id="quick-entry-category"
                      accounts={categoryAccounts}
                      label={`${quickEntryKindLabels[kind]}分類`}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
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
              <FieldLabel htmlFor="quick-entry-funding">
                {quickEntryFundingLabels[kind]}
              </FieldLabel>
              {fundingAccounts.length > 0 ? (
                <Controller
                  control={form.control}
                  name="fundingKey"
                  rules={{ required: "請選擇帳戶。" }}
                  render={({ field }) => (
                    <AccountPills
                      id="quick-entry-funding"
                      accounts={fundingAccounts}
                      label={quickEntryFundingLabels[kind]}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              ) : (
                <MissingAccounts
                  types={quickEntryFundingTypes}
                  presentation={presentation}
                  onNavigate={onNavigate}
                />
              )}
              <FieldError>{errors.fundingKey?.message}</FieldError>
            </Field>
          </FieldSet>

          <FieldSeparator />

          <FieldSet className="gap-4">
            <FieldLegend>其他</FieldLegend>
            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <Field data-invalid={Boolean(errors.date?.message)}>
                <FieldLabel htmlFor="quick-entry-date">交易日期</FieldLabel>
                <Controller
                  control={form.control}
                  name="date"
                  rules={{ required: "請選擇交易日期。" }}
                  render={({ field, fieldState }) => (
                    <DatePicker
                      ref={field.ref}
                      id="quick-entry-date"
                      value={field.value}
                      required
                      pickerTitle="選擇交易日期"
                      aria-invalid={fieldState.invalid}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <FieldError>{errors.date?.message}</FieldError>
              </Field>
            </div>
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
          </FieldSet>

          <EntryEditorRootError message={errors.root?.message} />
        </FieldGroup>
      </EditorBody>

      <EditorFooter
        className={cn(
          presentation === "page" ? entryEditorPageFooterClassName : undefined,
        )}
      >
        {presentation === "page" ? (
          <Button asChild type="button" variant="outline">
            <AppLink
              to={{ pathname: "/entries", search }}
              transitionIntent="back"
            >
              取消
            </AppLink>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={submission.isPending}
            onClick={onCancel}
          >
            取消
          </Button>
        )}
        <Button type="submit" loading={submission.isPending}>
          建立交易
        </Button>
      </EditorFooter>

      <DuplicateEntryDialog
        {...submission.duplicateDialogProps}
        onBeforeConfirm={() => form.clearErrors("root")}
      />
    </form>
  );
}
