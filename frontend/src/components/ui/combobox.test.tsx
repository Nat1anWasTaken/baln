import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Combobox } from "@/components/ui/combobox";

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

const options = [
  { value: "checking", label: "支票帳戶" },
  { value: "savings", label: "儲蓄帳戶" },
];

afterEach(() => vi.unstubAllGlobals());

describe("Combobox", () => {
  it("keeps mobile search idle until the user focuses it", async () => {
    setViewport(true);
    const user = userEvent.setup();

    render(
      <Combobox
        sheetTitle="帳戶類型"
        value="savings"
        onValueChange={() => undefined}
        options={options}
      />,
    );

    await user.click(screen.getByRole("combobox"));

    const picker = await screen.findByRole("dialog", { name: "帳戶類型" });
    const search = screen.getByPlaceholderText("搜尋…");
    expect(picker).toHaveFocus();
    expect(search).not.toHaveFocus();
    expect(screen.getByRole("option", { name: "儲蓄帳戶" })).toHaveAttribute(
      "data-checked",
      "true",
    );

    await user.click(search);
    expect(search).toHaveFocus();
    expect(picker).toHaveAttribute("data-size", "near-full");
    await user.type(search, "支票");
    expect(screen.getByRole("option", { name: "支票帳戶" })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "儲蓄帳戶" }),
    ).not.toBeInTheDocument();

    fireEvent.blur(search);
    expect(picker).toHaveAttribute("data-size", "content");
  });

  it("keeps the mobile sheet near-full while IME input has no matches", async () => {
    setViewport(true);
    const user = userEvent.setup();

    render(
      <Combobox
        sheetTitle="帳戶類型"
        value=""
        onValueChange={() => undefined}
        options={options}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    const picker = await screen.findByRole("dialog", { name: "帳戶類型" });
    const search = screen.getByPlaceholderText("搜尋…");

    await user.click(search);
    fireEvent.compositionStart(search);
    await user.type(search, "不存在");

    expect(screen.getByText("找不到項目。")).toBeVisible();
    expect(search).toHaveFocus();
    expect(picker).toHaveAttribute("data-size", "near-full");

    fireEvent.compositionEnd(search);
    fireEvent.blur(search);
    expect(picker).toHaveAttribute("data-size", "content");
  });

  it("collapses instead of dismissing when dragged while mobile search is focused", async () => {
    setViewport(true);
    const user = userEvent.setup();

    render(
      <Combobox
        sheetTitle="帳戶類型"
        value=""
        onValueChange={() => undefined}
        options={options}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    const picker = await screen.findByRole("dialog", { name: "帳戶類型" });
    const search = screen.getByPlaceholderText("搜尋…");
    await user.click(search);

    fireEvent.touchStart(picker, {
      changedTouches: [{ clientX: 100, clientY: 100 }],
      touches: [{ clientX: 100, clientY: 100 }],
    });
    fireEvent.touchMove(picker, {
      changedTouches: [{ clientX: 100, clientY: 220 }],
      touches: [{ clientX: 100, clientY: 220 }],
    });
    fireEvent.touchEnd(picker);

    expect(picker).toBeVisible();
    expect(search).not.toHaveFocus();
    expect(picker).toHaveAttribute("data-size", "content");
  });

  it("resets mobile search after closing and restores the trigger", async () => {
    setViewport(true);
    const user = userEvent.setup();

    render(
      <Combobox
        sheetTitle="帳戶類型"
        value=""
        onValueChange={() => undefined}
        options={options}
      />,
    );

    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    const search = await screen.findByPlaceholderText("搜尋…");
    await user.type(search, "支票");
    await user.click(screen.getByRole("button", { name: "關閉" }));
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    expect(await screen.findByPlaceholderText("搜尋…")).toHaveValue("");
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("keeps the searchable anchored popover on desktop", async () => {
    setViewport(false);
    const user = userEvent.setup();

    render(
      <Combobox
        sheetTitle="帳戶類型"
        value=""
        onValueChange={() => undefined}
        options={options}
      />,
    );

    await user.click(screen.getByRole("combobox"));

    const search = await screen.findByPlaceholderText("搜尋…");
    expect(search).toHaveFocus();
    expect(
      document.querySelector('[data-slot="popover-content"]'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "帳戶類型" }),
    ).not.toBeInTheDocument();
  });

  it("renders custom option content without changing its searchable label", async () => {
    setViewport(false);
    const user = userEvent.setup();

    render(
      <Combobox
        sheetTitle="方向"
        value="debit"
        onValueChange={() => undefined}
        options={[
          {
            value: "debit",
            label: "借方",
            content: <span data-tone="debit">借方</span>,
          },
          {
            value: "credit",
            label: "貸方",
            content: <span data-tone="credit">貸方</span>,
          },
        ]}
      />,
    );

    const trigger = screen.getByRole("combobox");
    expect(trigger.querySelector('[data-tone="debit"]')).toBeInTheDocument();

    await user.click(trigger);
    const search = await screen.findByPlaceholderText("搜尋…");
    await user.type(search, "貸方");

    const option = screen.getByRole("option", { name: "貸方" });
    expect(option.querySelector('[data-tone="credit"]')).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "借方" }),
    ).not.toBeInTheDocument();
  });
});
