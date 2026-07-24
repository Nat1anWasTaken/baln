import { FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";

import { CenteredCardHeader } from "@/components/centered-card-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function NotFoundPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CenteredCardHeader
          icon={<FileQuestion className="size-6" aria-hidden="true" />}
          iconTone="muted"
          title="找不到這個頁面"
          description="網址可能已變更，或你沒有權限查看這項內容。"
        />
        <CardContent>
          <Button className="w-full" asChild>
            <Link to="/">返回總覽</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
