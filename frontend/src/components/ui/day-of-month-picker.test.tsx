import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DayOfMonthPicker } from "@/components/ui/day-of-month-picker";

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

function DayOfMonthPickerHarness() {
  const [day, setDay] = useState(1);

  return (
    <DayOfMonthPicker
      aria-label="每月起始日"
      value={day}
      onValueChange={setDay}
    />
  );
}

describe("DayOfMonthPicker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts fast desktop input and rejects days outside 1 to 31", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(<DayOfMonthPickerHarness />);

    const input = screen.getByLabelText("每月起始日");
    await user.clear(input);
    await user.type(input, "31{Enter}");
    expect(input).toHaveValue("31");

    await user.clear(input);
    await user.type(input, "32{Enter}");
    expect(screen.getByText("請輸入 1 到 31 的日期。")).toBeVisible();

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("31");
  });

  it("presents the fallback rule and selects a day with the keyboard", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(<DayOfMonthPickerHarness />);

    await user.click(screen.getByRole("button", { name: "開啟每月起始日" }));
    expect(
      screen.getByText("當月沒有此日期時，改由該月最後一天開始。"),
    ).toBeVisible();

    const day31 = screen.getByRole("button", { name: "31 日" });
    day31.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("每月起始日")).toHaveValue("31");
    expect(
      screen.queryByRole("button", { name: "31 日" }),
    ).not.toBeInTheDocument();
  });

  it("moves by weeks with arrow keys", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(<DayOfMonthPickerHarness />);

    await user.click(screen.getByRole("button", { name: "開啟每月起始日" }));
    const day1 = screen.getByRole("button", { name: "1 日" });
    day1.focus();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByLabelText("每月起始日")).toHaveValue("8");
  });

  it("uses the same touch-first sheet pattern on mobile", async () => {
    setViewport(true);
    const user = userEvent.setup();
    render(<DayOfMonthPickerHarness />);

    const trigger = screen.getByRole("button", { name: "每月起始日" });
    expect(trigger).toHaveTextContent("每月 1 日開始");
    await user.click(trigger);

    const sheet = await screen.findByRole("dialog", { name: "每月起始日" });
    expect(sheet).toHaveFocus();
    expect(screen.getByLabelText("每月起始日手動輸入")).not.toHaveFocus();
  });
});
