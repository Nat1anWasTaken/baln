import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, PiggyBank } from "lucide-react";
import { useRef, useState } from "react";

import { useOfflineReadOnly } from "@/auth/auth-context";
import { BudgetCard } from "@/components/budget-card";
import { AppLink } from "@/components/navigation-transition";
import { OfflineUnavailableState } from "@/components/offline-state";
import { CardLoading, EmptyState, ErrorState } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { budgetsApi } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function BudgetCarousel() {
  const isReadOnly = useOfflineReadOnly();
  const budgets = useQuery({
    queryKey: queryKeys.budgets.list(true),
    queryFn: () => budgetsApi.list(true),
  });
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (budgets.isPending && isReadOnly) {
    return <OfflineUnavailableState title="尚未儲存預算資料" />;
  }
  if (budgets.isPending) return <CardLoading rows={2} />;
  if (budgets.isError) {
    return (
      <ErrorState
        message={budgets.error.message}
        onRetry={() => void budgets.refetch()}
      />
    );
  }
  if (budgets.data.length === 0) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="尚未選擇總覽預算"
        description="建立預算並開啟總覽顯示後，就能在這裡快速掌握額度。"
        action={
          <Button asChild>
            <AppLink to="/budgets">管理預算</AppLink>
          </Button>
        }
      />
    );
  }
  const items = budgets.data;

  function goTo(index: number) {
    const next = Math.max(0, Math.min(index, items.length - 1));
    const element = track.current?.children.item(next);
    if (element instanceof HTMLElement) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      element.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "nearest",
        inline: "start",
      });
      setActive(next);
    }
  }

  function syncActive() {
    const container = track.current;
    if (!container) return;
    const children = Array.from(container.children) as HTMLElement[];
    const next = children.reduce(
      (best, child, index) =>
        Math.abs(child.offsetLeft - container.scrollLeft) < best.distance
          ? {
              index,
              distance: Math.abs(child.offsetLeft - container.scrollLeft),
            }
          : best,
      { index: 0, distance: Number.POSITIVE_INFINITY },
    ).index;
    setActive(next);
  }

  return (
    <section aria-label="總覽預算" className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">預算快覽</p>
          <h2 className="font-heading text-xl font-semibold">目前預算</h2>
        </div>
        {items.length > 1 ? (
          <div className="flex gap-1 md:hidden">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="上一個預算"
              disabled={active === 0}
              onClick={() => goTo(active - 1)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") goTo(active + 1);
              }}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="下一個預算"
              disabled={active === items.length - 1}
              onClick={() => goTo(active + 1)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") goTo(active - 1);
              }}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>
      <div
        ref={track}
        onScroll={syncActive}
        aria-roledescription="carousel"
        aria-label="總覽預算"
        className="budget-carousel-track flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 outline-none overscroll-x-contain focus-visible:ring-2 focus-visible:ring-ring/50 md:hidden"
      >
        {items.map((budget, index) => (
          <article
            key={budget.id}
            aria-roledescription="slide"
            aria-label={`${index + 1} / ${items.length}`}
            className="w-full shrink-0 snap-start sm:w-[24rem]"
          >
            <BudgetCard budget={budget} to={`/budgets/${budget.id}`} />
          </article>
        ))}
      </div>
      {items.length > 1 ? (
        <div
          className="flex justify-center gap-2 md:hidden"
          aria-label="預算位置"
        >
          {items.map((budget, index) => (
            <Button
              key={budget.id}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`前往第 ${index + 1} 個預算`}
              aria-current={active === index ? "true" : undefined}
              className="rounded-full"
              onClick={() => goTo(index)}
            >
              <span
                className={`block h-1.5 rounded-full transition-[width,background-color] ${active === index ? "w-6 bg-foreground" : "w-1.5 bg-muted-foreground/40"}`}
              />
            </Button>
          ))}
        </div>
      ) : null}
      <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-3">
        {items.map((budget) => (
          <article key={budget.id}>
            <BudgetCard budget={budget} to={`/budgets/${budget.id}`} />
          </article>
        ))}
      </div>
    </section>
  );
}
