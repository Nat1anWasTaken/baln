import { FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";

import { CenteredCardHeader } from "@/components/centered-card-header";
import { CenteredPage } from "@/components/centered-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function NotFoundPage() {
  return (
    <CenteredPage>
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
    </CenteredPage>
  );
}
