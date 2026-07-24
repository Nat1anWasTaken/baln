import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { EmptyState, ErrorState, PageLoading } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { EntryEditor } from "@/features/entries/entry-editor";
import { accountsApi, entriesApi } from "@/lib/api-client";

export function EntryEditorPage() {
  const { entryId } = useParams();
  const isEditing = Boolean(entryId);
  const accounts = useQuery({
    queryKey: ["accounts", true, ""],
    queryFn: () => accountsApi.list(true),
  });
  const entry = useQuery({
    queryKey: ["entry", entryId],
    queryFn: () => entriesApi.get(entryId!),
    enabled: isEditing,
  });

  if (accounts.isPending || (isEditing && entry.isPending)) {
    return <PageLoading rows={5} />;
  }
  if (accounts.isError) {
    return (
      <ErrorState
        message={accounts.error.message}
        onRetry={() => void accounts.refetch()}
      />
    );
  }
  if (entry.isError) {
    return (
      <ErrorState
        message={entry.error.message}
        onRetry={() => void entry.refetch()}
      />
    );
  }

  const activeAccounts = accounts.data.filter((account) => !account.archived);
  if (!isEditing && activeAccounts.length === 0) {
    return (
      <EmptyState
        title="請先建立帳戶"
        description="至少需要可用的帳戶才能建立交易。"
        action={
          <Button asChild>
            <Link to="/accounts">前往帳戶管理</Link>
          </Button>
        }
      />
    );
  }

  return <EntryEditor accounts={accounts.data} entry={entry.data} />;
}
