import { FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/page-state";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl items-center p-4">
      <EmptyState
        icon={FileQuestion}
        title="找不到這個頁面"
        description="網址可能已變更，或你沒有權限查看這項內容。"
        action={
          <Button asChild>
            <Link to="/">返回總覽</Link>
          </Button>
        }
      />
    </main>
  );
}
