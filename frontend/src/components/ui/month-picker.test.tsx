import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { MonthPicker } from "@/components/ui/month-picker";

function MonthPickerHarness() {
  const [month, setMonth] = useState("2026-07");

  return (
    <MonthPicker aria-label="總覽月份" value={month} onValueChange={setMonth} />
  );
}

describe("MonthPicker", () => {
  it("presents and selects months in Traditional Chinese with the keyboard", async () => {
    const user = userEvent.setup();
    render(<MonthPickerHarness />);

    const trigger = screen.getByRole("button", { name: "總覽月份" });
    expect(trigger).toHaveTextContent("2026 年 7 月");

    await user.click(trigger);
    expect(screen.getByText("2026 年", { exact: true })).toBeVisible();

    const december = screen.getByRole("button", { name: "12 月" });
    december.focus();
    await user.keyboard("{Enter}");

    expect(trigger).toHaveTextContent("2026 年 12 月");
    expect(
      screen.queryByRole("button", { name: "12 月" }),
    ).not.toBeInTheDocument();
  });
});
