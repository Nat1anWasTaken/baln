import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
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
import type { Account, AccountType } from "@/lib/schemas";

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
              帳戶代碼建立後不可修改，顯示名稱可以隨時調整。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
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
          </div>
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

  const update = useMutation({
    mutationFn: ({
      nextName,
      nextNote,
    }: {
      nextName: string;
      nextNote: string | null;
    }) =>
      accountsApi.update(account!.id, {
        name: nextName,
        note: nextNote,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("帳戶已更新");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!account || !name.trim()) return;
    update.mutate({
      nextName: name.trim(),
      nextNote: note.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>編輯帳戶</DialogTitle>
            <DialogDescription>{account?.key}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <Field>
              <FieldLabel htmlFor="edit-account-name">顯示名稱</FieldLabel>
              <Input
                id="edit-account-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
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
          </div>
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
              disabled={!name.trim()}
              loading={update.isPending}
            >
              儲存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
