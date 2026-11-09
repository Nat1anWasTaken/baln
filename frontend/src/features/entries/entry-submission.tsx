import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { EntrySummary } from "@/components/entry-list-item";
import { useAppNavigate } from "@/components/navigation-transition";
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
import { Card } from "@/components/ui/card";
import { ApiError, entriesApi } from "@/lib/api-client";
import { invalidateAfterEntryWrite } from "@/lib/query-invalidation";
import { possibleDuplicateFieldsSchema } from "@/lib/schemas";
import type {
  EntryResponse,
  EntryWriteRequest,
  PossibleDuplicateFields,
} from "@/lib/schemas";

export type EntrySubmission = {
  body: EntryWriteRequest;
  confirmedDistinct: boolean;
};

type DuplicateReview = {
  submission: EntrySubmission;
  fields: PossibleDuplicateFields;
};

/**
 * Shared create/update flow for every entry editor, including duplicate
 * review, cache invalidation, feedback toasts, and post-save navigation.
 */
export function useEntrySubmission({
  entry,
  onError,
  onPendingChange,
  onSaved,
}: {
  entry?: EntryResponse;
  onError: (message: string) => void;
  onPendingChange?: (pending: boolean) => void;
  onSaved?: (entry: EntryResponse) => void;
}) {
  const { search } = useLocation();
  const navigate = useAppNavigate();
  const queryClient = useQueryClient();
  const [duplicateReview, setDuplicateReview] =
    useState<DuplicateReview | null>(null);

  const mutation = useMutation({
    mutationFn: ({ body, confirmedDistinct }: EntrySubmission) => {
      return entry
        ? entriesApi.update(entry.id, body)
        : entriesApi.create({
            ...body,
            dedup_key: null,
            confirmed_distinct: confirmedDistinct,
          });
    },
    onSuccess: async (saved) => {
      await invalidateAfterEntryWrite(queryClient);
      toast.success(entry ? "交易已更新" : "交易已建立");
      if (onSaved) {
        onSaved(saved);
      } else {
        navigate(
          { pathname: `/entries/${saved.id}`, search },
          {
            replace: true,
            transitionIntent: entry ? "back" : "forward",
          },
        );
      }
    },
    onError: (error, submission) => {
      if (
        !entry &&
        !submission.confirmedDistinct &&
        error instanceof ApiError &&
        error.problem.code === "possible_duplicate"
      ) {
        const fields = possibleDuplicateFieldsSchema.safeParse(
          error.problem.fields,
        );
        if (fields.success) {
          setDuplicateReview({ submission, fields: fields.data });
          return;
        }
      }
      onError(error.message);
      toast.error(error.message);
    },
  });

  useEffect(() => {
    onPendingChange?.(mutation.isPending);
  }, [mutation.isPending, onPendingChange]);

  return {
    isPending: mutation.isPending,
    submit: (body: EntryWriteRequest) =>
      mutation.mutate({ body, confirmedDistinct: false }),
    duplicateDialogProps: {
      review: duplicateReview,
      isPending: mutation.isPending,
      onDismiss: () => setDuplicateReview(null),
      onConfirm: (review: DuplicateReview) =>
        mutation.mutate({ ...review.submission, confirmedDistinct: true }),
    },
  };
}

export function DuplicateEntryDialog({
  review,
  isPending,
  onConfirm,
  onDismiss,
  onBeforeConfirm,
}: {
  review: DuplicateReview | null;
  isPending: boolean;
  onConfirm: (review: DuplicateReview) => void;
  onDismiss: () => void;
  onBeforeConfirm?: () => void;
}) {
  const duplicateEntries =
    review?.fields.matches
      .flatMap((match) => match.existing_entries)
      .filter(
        (candidate, index, candidates) =>
          candidates.findIndex((entry) => entry.id === candidate.id) === index,
      ) ?? [];

  return (
    <AlertDialog
      open={review !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onDismiss();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>可能重複的交易</AlertDialogTitle>
          <AlertDialogDescription>
            已找到日期、帳戶與金額相同的交易。請確認這是否為另一筆交易。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid max-h-72 gap-2 overflow-y-auto">
          {duplicateEntries.map((candidate) => (
            <Card key={candidate.id}>
              <EntrySummary entry={candidate} />
            </Card>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" disabled={isPending}>
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={!review}
            loading={isPending}
            onClick={(event) => {
              event.preventDefault();
              if (review) {
                onBeforeConfirm?.();
                onConfirm(review);
              }
            }}
          >
            仍要建立
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
