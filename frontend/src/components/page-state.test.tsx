import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EmptyState, ErrorState, PageLoading } from "@/components/page-state";

describe("shared page states", () => {
  it("keeps the list loader compact and configurable", () => {
    const { container } = render(<PageLoading rows={2} />);

    expect(screen.getByRole("status", { name: "載入中" })).toHaveAttribute(
      "data-loading-variant",
      "list",
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      2,
    );
  });

  it("mirrors the dashboard KPI and chart card structure while loading", () => {
    const { container } = render(<PageLoading variant="dashboard" />);

    expect(screen.getByRole("status", { name: "載入中" })).toHaveAttribute(
      "data-loading-variant",
      "dashboard",
    );
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(5);
  });

  it("renders an empty state with a visible dashed treatment", () => {
    render(
      <EmptyState title="沒有資料" description="目前沒有可顯示的項目。" />,
    );

    expect(
      screen.getByText("沒有資料").closest('[data-slot="card"]'),
    ).toHaveClass("border-dashed", "ring-0");
  });

  it("renders an error state with destructive emphasis and retry support", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="連線失敗" onRetry={onRetry} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-destructive/5", "ring-destructive/30");
    screen.getByRole("button", { name: "重新載入" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
