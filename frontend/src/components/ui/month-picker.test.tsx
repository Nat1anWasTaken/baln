import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonthPicker } from "@/components/ui/month-picker";

function setViewport(mobile: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: mobile && query === "(max-width: 767px)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  );
}

function MonthPickerHarness() {
  const [month, setMonth] = useState("2026-07");

  return (
    <MonthPicker aria-label="總覽月份" value={month} onValueChange={setMonth} />
  );
}

describe("MonthPicker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts fast desktop input and rejects invalid months", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(<MonthPickerHarness />);

    const input = screen.getByLabelText("總覽月份");
    expect(input).toHaveValue("2026/07");

    await user.clear(input);
    await user.type(input, "202612{Enter}");
    expect(input).toHaveValue("2026/12");

    await user.clear(input);
    await user.type(input, "202613{Enter}");
    expect(screen.getByText("請輸入有效月份（YYYY/MM）。")).toBeVisible();

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("2026/12");
  });

  it("presents and selects months in Traditional Chinese", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(<MonthPickerHarness />);

    await user.click(screen.getByRole("button", { name: "開啟總覽月份" }));
    expect(screen.getByText("2026 年", { exact: true })).toBeVisible();

    const december = screen.getByRole("button", { name: "12 月" });
    december.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("總覽月份")).toHaveValue("2026/12");
    expect(
      screen.queryByRole("button", { name: "12 月" }),
    ).not.toBeInTheDocument();
  });

  it("moves through the month grid with arrow keys", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(<MonthPickerHarness />);

    await user.click(screen.getByRole("button", { name: "開啟總覽月份" }));
    const july = screen.getByRole("button", { name: "7 月" });
    july.focus();
    await user.keyboard("{ArrowRight}{Enter}");

    expect(screen.getByLabelText("總覽月份")).toHaveValue("2026/08");
  });

  it("uses the same touch-first sheet pattern on mobile", async () => {
    setViewport(true);
    const user = userEvent.setup();
    render(<MonthPickerHarness />);

    const trigger = screen.getByRole("button", { name: "總覽月份" });
    expect(trigger).toHaveTextContent("2026 年 7 月");
    await user.click(trigger);

    const sheet = await screen.findByRole("dialog", { name: "總覽月份" });
    expect(sheet).toHaveFocus();
    expect(screen.getByLabelText("總覽月份手動輸入")).not.toHaveFocus();
  });
});
