import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function setMobileViewport() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === "(max-width: 767px)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  );
}

function setDesktopViewport() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  );
}

function MobileDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent>
        <DialogTitle>編輯項目</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("floating content in a mobile dialog", () => {
  it("opens a combobox picker above its parent sheet", async () => {
    setMobileViewport();
    const onValueChange = vi.fn();

    render(
      <MobileDialog>
        <Combobox
          sheetTitle="帳戶類型"
          value=""
          onValueChange={onValueChange}
          options={[
            { value: "checking", label: "支票帳戶" },
            { value: "savings", label: "儲蓄帳戶" },
          ]}
        />
      </MobileDialog>,
    );

    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);

    const picker = await screen.findByRole("dialog", { name: "帳戶類型" });
    const search = screen.getByPlaceholderText("搜尋…");
    expect(picker).toHaveAttribute("data-presentation", "sheet");
    expect(picker).toHaveFocus();
    expect(search).not.toHaveFocus();
    expect(
      document.querySelector('[data-slot="popover-content"]'),
    ).not.toBeInTheDocument();

    const parentSheet = document.querySelector<HTMLElement>(
      '[data-slot="dialog-content"]',
    );
    expect(parentSheet).toHaveAttribute("data-presentation", "sheet");

    fireEvent.click(screen.getByRole("option", { name: "支票帳戶" }));
    expect(onValueChange).toHaveBeenCalledWith("checking");
    await waitFor(() => expect(picker).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "編輯項目" })).toBeVisible();
    expect(trigger).toHaveFocus();
  });

  it("portals dropdown content into the sheet scroll boundary", async () => {
    setMobileViewport();

    render(
      <MobileDialog>
        <DropdownMenu>
          <DropdownMenuTrigger>選擇動作</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>封存</DropdownMenuItem>
            <DropdownMenuItem>刪除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </MobileDialog>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "選擇動作" }), {
      button: 0,
      ctrlKey: false,
    });
    await screen.findByRole("menuitem", { name: "封存" });

    const sheet = screen.getByRole("dialog", { name: "編輯項目" });
    const content = document.querySelector<HTMLElement>(
      '[data-slot="dropdown-menu-content"]',
    );
    expect(sheet).toContainElement(content);
  });
});

describe("dialog initial focus", () => {
  it.each([
    ["desktop dialog", setDesktopViewport],
    ["mobile sheet", setMobileViewport],
  ])("can keep form fields idle in a %s", async (_, setViewport) => {
    setViewport();

    render(
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent initialFocus="content">
          <DialogTitle>編輯項目</DialogTitle>
          <label>
            名稱
            <input />
          </label>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "編輯項目" });
    const input = screen.getByRole("textbox", { name: "名稱" });
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(input).not.toHaveFocus();
  });
});
