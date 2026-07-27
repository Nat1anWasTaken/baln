import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
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
import { Textarea } from "@/components/ui/textarea";
import {
  accountKeyIsValid,
  accountTypeLabels,
  accountTypes,
} from "@/lib/account";
import { accountsApi } from "@/lib/api-client";
import type { Account, AccountType, UpdateAccountRequest } from "@/lib/schemas";

export function CreateAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<AccountType>("asset");
  const [suffix, setSuffix] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const key = useMemo(() => `${type}.${suffix.trim()}`, [suffix, type]);
  const keyValid = accountKeyIsValid(key, type);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setName("");
      setNote("");
      setType("asset");
      setSuffix("");
      setSubmitted(false);
    }
    onOpenChange(nextOpen);
  }

  const create = useMutation({
    mutationFn: accountsApi.create,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("帳戶已建立");
      changeOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!name.trim() || !keyValid) return;
    create.mutate({ name: name.trim(), note: note.trim() || null, key, type });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>新增帳戶</DialogTitle>
            <DialogDescription>
              建立後仍可修改顯示名稱、帳戶代碼與類型。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field data-invalid={submitted && !name.trim()}>
              <FieldLabel htmlFor="account-name">顯示名稱</FieldLabel>
              <Input
                id="account-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：玉山銀行"
                aria-invalid={submitted && !name.trim()}
              />
              {submitted && !name.trim() ? (
                <FieldError>請輸入帳戶名稱。</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="account-type">帳戶類型</FieldLabel>
              <Combobox
                id="account-type"
                value={type}
                onValueChange={(value) => setType(value as AccountType)}
                options={accountTypes.map((value) => ({
                  value,
                  label: accountTypeLabels[value],
                }))}
                searchPlaceholder="搜尋帳戶類型…"
                emptyText="找不到帳戶類型。"
              />
            </Field>
            <Field data-invalid={submitted && !keyValid}>
              <FieldLabel htmlFor="account-key">帳戶代碼</FieldLabel>
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1.5 text-sm">
                  {type}.
                </span>
                <Input
                  id="account-key"
                  value={suffix}
                  onChange={(event) => setSuffix(event.target.value)}
                  placeholder="bank.esun"
                  aria-invalid={submitted && !keyValid}
                />
              </div>
              <FieldDescription>
                使用一至兩段小寫英文、數字或底線，例如 cash、bank.esun。
              </FieldDescription>
              {submitted && !keyValid ? (
                <FieldError>帳戶代碼格式不正確。</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="account-note">帳戶備註</FieldLabel>
              <Textarea
                id="account-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：這個帳戶連結到郵局金融卡"
                maxLength={2000}
              />
              <FieldDescription>
                提供給 AI 代理辨識付款工具或帳戶別名，最多 2,000 個字元。
              </FieldDescription>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => changeOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" loading={create.isPending}>
              建立帳戶
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditAccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(account?.name ?? "");
  const [note, setNote] = useState(account?.note ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "asset");
  const [suffix, setSuffix] = useState(
    account?.key.split(".").slice(1).join(".") ?? "",
  );
  const [submitted, setSubmitted] = useState(false);
  const [pendingUpdate, setPendingUpdate] =
    useState<UpdateAccountRequest | null>(null);
  const key = useMemo(() => `${type}.${suffix.trim()}`, [suffix, type]);
  const keyValid = accountKeyIsValid(key, type);

  const update = useMutation({
    mutationFn: (body: UpdateAccountRequest) =>
      accountsApi.update(account!.id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("帳戶已更新");
      setPendingUpdate(null);
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!account || !name.trim() || !keyValid) return;
    const identityChanged = key !== account.key || type !== account.type;
    const body: UpdateAccountRequest = {
      name: name.trim(),
      note: note.trim() || null,
      ...(identityChanged
        ? {
            key,
            type,
            expected_updated_at: account.updated_at,
          }
        : {}),
    };
    if (identityChanged) {
      setPendingUpdate(body);
    } else {
      update.mutate(body);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>編輯帳戶</DialogTitle>
            <DialogDescription>
              可修改顯示名稱、帳戶類型、帳戶代碼與備註。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field data-invalid={submitted && !name.trim()}>
              <FieldLabel htmlFor="edit-account-name">顯示名稱</FieldLabel>
              <Input
                id="edit-account-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={submitted && !name.trim()}
              />
              {submitted && !name.trim() ? (
                <FieldError>請輸入帳戶名稱。</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-account-type">帳戶類型</FieldLabel>
              <Combobox
                id="edit-account-type"
                value={type}
                onValueChange={(value) => setType(value as AccountType)}
                options={accountTypes.map((value) => ({
                  value,
                  label: accountTypeLabels[value],
                }))}
                searchPlaceholder="搜尋帳戶類型…"
                emptyText="找不到帳戶類型。"
              />
            </Field>
            <Field data-invalid={submitted && !keyValid}>
              <FieldLabel htmlFor="edit-account-key">帳戶代碼</FieldLabel>
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1.5 text-sm">
                  {type}.
                </span>
                <Input
                  id="edit-account-key"
                  value={suffix}
                  onChange={(event) => setSuffix(event.target.value)}
                  placeholder="bank.esun"
                  aria-invalid={submitted && !keyValid}
                />
              </div>
              <FieldDescription>
                使用一至兩段小寫英文、數字或底線，例如 cash、bank.esun。
              </FieldDescription>
              {submitted && !keyValid ? (
                <FieldError>帳戶代碼格式不正確。</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-account-note">帳戶備註</FieldLabel>
              <Textarea
                id="edit-account-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：這個帳戶連結到郵局金融卡"
                maxLength={2000}
              />
              <FieldDescription>
                提供給 AI 代理辨識付款工具或帳戶別名，最多 2,000 個字元。
              </FieldDescription>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !keyValid}
              loading={update.isPending}
            >
              儲存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <AlertDialog
        open={pendingUpdate !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !update.isPending) setPendingUpdate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>變更帳戶代碼或類型？</AlertDialogTitle>
            <AlertDialogDescription>
              帳戶代碼將由 {account?.key} 變更為 {pendingUpdate?.key}
              。既有交易會保留並顯示新代碼，但舊代碼會立即失效。變更類型會重新分類所有歷史餘額與報表。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>
              返回編輯
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!pendingUpdate}
              loading={update.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingUpdate) update.mutate(pendingUpdate);
              }}
            >
              確認變更
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
