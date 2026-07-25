import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("keeps a stable label while exposing and blocking a loading action", () => {
    render(<Button loading>建立交易</Button>);

    const button = screen.getByRole("button", { name: "建立交易" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-loading", "true");
    expect(button).toHaveTextContent("建立交易");
  });

  it("forwards loading state through asChild", () => {
    render(
      <Button asChild loading>
        <button type="button">確認刪除</button>
      </Button>,
    );

    const button = screen.getByRole("button", { name: "確認刪除" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-loading", "true");
  });
});
