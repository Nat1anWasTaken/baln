import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NumberField } from "@/components/ui/number-field";

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

function Harness({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="limit">每期額度</label>
      <NumberField
        id="limit"
        title="每期額度"
        value={value}
        onValueChange={setValue}
      />
      <output aria-label="saved">{value}</output>
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("NumberField", () => {
  it("keeps the native number input on desktop", async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("spinbutton", { name: "每期額度" });
    await user.type(input, "3000");
    expect(screen.getByLabelText("saved")).toHaveTextContent("3000");
    await user.clear(input);
    expect(screen.getByLabelText("saved")).toHaveTextContent("0");
  });

  it("uses an on-screen keypad on phones and commits only on done", async () => {
    setViewport(true);
    const user = userEvent.setup();
    render(<Harness initial={1200} />);

    expect(screen.queryByRole("spinbutton")).toBeNull();
    const trigger = screen.getByRole("button", { name: "每期額度" });
    expect(trigger).toHaveTextContent("1,200");

    await user.click(trigger);
    let sheet = await screen.findByRole("dialog", { name: "每期額度" });
    expect(within(sheet).queryByRole("textbox")).toBeNull();
    await user.click(within(sheet).getByRole("button", { name: "5" }));
    await user.click(
      within(sheet).getByRole("button", { name: "關閉每期額度" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "每期額度" })).toBeNull(),
    );
    expect(screen.getByLabelText("saved")).toHaveTextContent("1200");

    await user.click(trigger);
    sheet = await screen.findByRole("dialog", { name: "每期額度" });
    const backspace = within(sheet).getByRole("button", {
      name: "刪除一位，長按清除",
    });
    await user.click(backspace);
    await user.click(backspace);
    await user.click(backspace);
    await user.click(within(sheet).getByRole("button", { name: "5" }));
    await user.click(within(sheet).getByRole("button", { name: "00" }));
    expect(
      within(sheet).getByRole("status", { name: "每期額度輸入值" }),
    ).toHaveTextContent("1,500");
    await user.click(within(sheet).getByRole("button", { name: "完成" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "每期額度" })).toBeNull(),
    );
    expect(screen.getByLabelText("saved")).toHaveTextContent("1500");
  });
});
