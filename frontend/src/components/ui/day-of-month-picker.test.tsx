import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { DayOfMonthPicker } from "@/components/ui/day-of-month-picker";

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
  it("presents the fallback rule and selects a day with the keyboard", async () => {
    const user = userEvent.setup();
    render(<DayOfMonthPickerHarness />);

    const trigger = screen.getByRole("button", { name: "每月起始日" });
    expect(trigger).toHaveTextContent("每月 1 日開始");

    await user.click(trigger);
    expect(
      screen.getByText("當月沒有此日期時，改由該月最後一天開始。"),
    ).toBeVisible();

    const day31 = screen.getByRole("button", { name: "31 日" });
    day31.focus();
    await user.keyboard("{Enter}");

    expect(trigger).toHaveTextContent("每月 31 日開始");
    expect(
      screen.queryByRole("button", { name: "31 日" }),
    ).not.toBeInTheDocument();
  });
});
