import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DatePicker,
  DateRangePicker,
  type DateRangeValue,
} from "@/components/ui/date-picker";

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

function SingleHarness() {
  const [value, setValue] = useState("2026-07-24");
  return (
    <>
      <DatePicker
        id="transaction-date"
        aria-label="交易日期"
        value={value}
        onValueChange={setValue}
      />
      <output>{value}</output>
    </>
  );
}

function RangeHarness({ allowOpenEnded = false }) {
  const [value, setValue] = useState<DateRangeValue>({ from: "", to: "" });
  return (
    <>
      <DateRangePicker
        id="range"
        value={value}
        allowOpenEnded={allowOpenEnded}
        clearable
        onValueChange={setValue}
      />
      <output>{`${value.from}|${value.to}`}</output>
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("DatePicker", () => {
  it("accepts fast keyboard entry and rejects impossible dates", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(<SingleHarness />);

    const input = screen.getByLabelText("交易日期");
    await user.clear(input);
    await user.type(input, "20280229{Enter}");
    expect(input).toHaveValue("2028/02/29");
    expect(screen.getByText("2028-02-29")).toBeVisible();

    await user.clear(input);
    await user.type(input, "2026/02/30{Enter}");
    expect(screen.getByText("請輸入有效日期（YYYY/MM/DD）。")).toBeVisible();
    expect(screen.getByText("2028-02-29")).toBeVisible();

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("2028/02/29");
  });

  it("opens a mobile sheet without focusing the manual input", async () => {
    setViewport(true);
    const user = userEvent.setup();
    render(<SingleHarness />);

    await user.click(screen.getByRole("button", { name: "交易日期" }));
    const sheet = await screen.findByRole("dialog", { name: "選擇日期" });
    const manualInput = screen.getByLabelText("選擇日期手動輸入");
    expect(sheet).toHaveFocus();
    expect(manualInput).not.toHaveFocus();

    await user.click(manualInput);
    expect(manualInput).toHaveFocus();
  });
});

describe("DateRangePicker", () => {
  it("preserves an open-ended range during direct desktop entry", () => {
    setViewport(false);
    render(<RangeHarness allowOpenEnded />);

    fireEvent.change(screen.getByLabelText("開始日期"), {
      target: { value: "2026/01/10" },
    });
    expect(screen.getByText("2026-01-10|")).toBeVisible();
  });

  it("stages a mobile range until the user applies it", async () => {
    setViewport(true);
    const user = userEvent.setup();
    render(<RangeHarness />);

    await user.click(screen.getByRole("button", { name: /不限日期/ }));
    const sheet = await screen.findByRole("dialog", {
      name: "選擇日期區間",
    });
    const from = screen.getByLabelText("開始日期");
    const to = screen.getByLabelText("結束日期");
    expect(sheet).toHaveFocus();
    expect(from).not.toHaveFocus();
    expect(to).not.toHaveFocus();

    await user.click(from);
    await user.type(from, "2026/01/10");
    await user.click(to);
    await user.type(to, "2026/01/20");
    expect(screen.getByText("|")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "套用" }));
    await waitFor(() =>
      expect(screen.getByText("2026-01-10|2026-01-20")).toBeVisible(),
    );
  });
});
